/**
 * HTTP Server Boundary for Lua Adviser Backend
 * Native Node http server for localhost integration testing and D1 serving.
 */

import http from 'node:http';
import { type AdviserSqliteStore } from '../data/sqlite.ts';
import { type BoundedAiClient } from '../ai/adapter.ts';
import { validateConfirmedProfile } from '../contracts/taxonomy.ts';
import {
  type RecommendationRequestEnvelope,
  type RecommendationResponseEnvelope,
  CURRENT_SCHEMA_VERSION,
  CURRENT_RULE_VERSION
} from '../contracts/envelope.ts';
import { evaluateEligibility } from '../domain/eligibility.ts';
import { rankEligibleCandidates } from '../domain/ranking.ts';
import { type StagedCrawlerOffer, validateStagedCrawlerOffer } from '../contracts/crawler.ts';

export function createHttpServer(
  store: AdviserSqliteStore,
  aiClient: BoundedAiClient
): http.Server {
  return http.createServer(async (req, res) => {
    // Helper to send JSON responses
    const sendJson = (statusCode: number, data: unknown) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(JSON.stringify(data));
    };

    // Helper to read incoming JSON body
    const readBody = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = '';
        let rejected = false;
        req.on('data', chunk => {
          if (rejected) return;
          body += chunk;
          if (body.length > 1_000_000) {
            rejected = true;
            const err: any = new Error('Payload Too Large');
            err.statusCode = 413;
            err.code = 'ERR_PAYLOAD_TOO_LARGE';
            reject(err);
          }
        });
        req.on('end', () => {
          if (rejected) return;
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            const err: any = new Error('Malformed JSON');
            err.statusCode = 400;
            err.code = 'ERR_INVALID_JSON';
            reject(err);
          }
        });
        req.on('error', reject);
      });
    };

    try {
      const url = req.url || '/';
      const method = req.method || 'GET';

      // 1. Health check
      if (method === 'GET' && url === '/health') {
        return sendJson(200, {
          status: 'ok',
          catalogVersion: store.getActiveCatalogVersion(),
          timestamp: new Date().toISOString()
        });
      }

      // 2. Crawler Staging Ingest
      if (method === 'POST' && url === '/advisor/v1/ingest') {
        const body = await readBody();
        const offers = Array.isArray(body) ? (body as StagedCrawlerOffer[]) : (body.offers as StagedCrawlerOffer[]);
        if (!Array.isArray(offers)) {
          return sendJson(400, {
            error: {
              code: 'ERR_INVALID_PAYLOAD',
              message: 'Payload must be an array of offers or have an offers array',
              retryable: false
            }
          });
        }

        // Validate each offer semantically
        const validationErrors: string[] = [];
        for (let i = 0; i < offers.length; i++) {
          const res = validateStagedCrawlerOffer(offers[i]);
          if (!res.valid) {
            validationErrors.push(`Offer at index ${i}: ${res.errors.join(', ')}`);
          }
        }

        if (validationErrors.length > 0) {
          return sendJson(400, {
            error: {
              code: 'ERR_SEMANTIC_VALIDATION',
              message: validationErrors.join('; '),
              retryable: false
            }
          });
        }

        store.saveOffers(offers);
        return sendJson(200, { status: 'accepted', count: offers.length });
      }

      // 3. Recommendation Request
      if (method === 'POST' && url === '/advisor/v1/recommend') {
        const envelope = (await readBody()) as RecommendationRequestEnvelope;

        // Metadata validation
        if (!envelope.requestId || !envelope.decisionId) {
          return sendJson(400, {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            requestId: envelope.requestId || 'unknown',
            decisionId: envelope.decisionId || 'unknown',
            profileRevision: envelope.profileRevision || 0,
            catalogVersion: store.getActiveCatalogVersion() || 'none',
            ruleVersion: CURRENT_RULE_VERSION,
            status: 'ERROR',
            shortlist: [],
            excludedVariants: [],
            error: {
              code: 'ERR_INVALID_PROFILE',
              message: 'Missing requestId or decisionId',
              retryable: false
            }
          });
        }

        // Profile validation
        const profileValidation = validateConfirmedProfile(envelope.profile);
        if (!profileValidation.valid) {
          const resp: RecommendationResponseEnvelope = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            requestId: envelope.requestId,
            decisionId: envelope.decisionId,
            profileRevision: envelope.profileRevision,
            catalogVersion: store.getActiveCatalogVersion() || 'none',
            ruleVersion: CURRENT_RULE_VERSION,
            status: 'ERR_INVALID_PROFILE',
            shortlist: [],
            excludedVariants: [],
            error: {
              code: 'ERR_INVALID_PROFILE',
              message: profileValidation.errors.join('; '),
              retryable: false
            }
          };
          return sendJson(400, resp);
        }

        // Active catalog check
        const activeCatalog = store.getActiveCatalogVersion();
        if (!activeCatalog) {
          const resp: RecommendationResponseEnvelope = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            requestId: envelope.requestId,
            decisionId: envelope.decisionId,
            profileRevision: envelope.profileRevision,
            catalogVersion: 'none',
            ruleVersion: CURRENT_RULE_VERSION,
            status: 'ERROR',
            shortlist: [],
            excludedVariants: [],
            error: {
              code: 'ERR_CATALOG_UNAVAILABLE',
              message: 'No active catalog snapshot found',
              retryable: true
            }
          };
          return sendJson(503, resp);
        }

        // Retrieve catalog variants
        const variants = store.getVariantsForActiveCatalog();
        const eligibleList = [];
        const excludedList = [];

        for (const variant of variants) {
          const offers = store.getOffersForVariant(variant.variantId);
          const eligibility = evaluateEligibility(variant, offers, envelope.profile);
          if (eligibility.isEligible) {
            eligibleList.push({ variant, eligibility });
          } else if (eligibility.exclusion) {
            excludedList.push(eligibility.exclusion);
          }
        }

        // Rank candidates
        const shortlist = rankEligibleCandidates(eligibleList, envelope.profile);

        const status = shortlist.length > 0 ? 'SUCCESS' : 'NO_FIT';

        const responseEnv: RecommendationResponseEnvelope = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          requestId: envelope.requestId,
          decisionId: envelope.decisionId,
          profileRevision: envelope.profileRevision,
          catalogVersion: activeCatalog,
          ruleVersion: CURRENT_RULE_VERSION,
          status,
          shortlist,
          excludedVariants: excludedList
        };

        return sendJson(200, responseEnv);
      }

      // 404 for unknown routes
      return sendJson(404, { error: 'Not Found' });
    } catch (err: any) {
      const statusCode = err?.statusCode || 500;
      const code = err?.code || (statusCode === 500 ? 'ERR_INTERNAL' : 'ERR_BAD_REQUEST');
      return sendJson(statusCode, {
        error: {
          code,
          message: err?.message || 'Internal Server Error',
          retryable: false
        }
      });
    }
  });
}
