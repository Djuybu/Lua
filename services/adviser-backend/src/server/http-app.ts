/**
 * HTTP Server Boundary for Lua Adviser Backend
 * Native Node http server for localhost integration testing and D1 serving.
 */

import http from 'node:http';
import { type AdviserSqliteStore } from '../data/sqlite.ts';
import { type AdviserPostgresStore } from '../data/postgres.ts';
import { type BoundedAiClient } from '../ai/adapter.ts';
import { validateConfirmedProfile } from '../contracts/taxonomy.ts';
import {
  type RecommendationRequestEnvelope,
  type RecommendationResponseEnvelope,
  type ResponseStatus,
  CURRENT_SCHEMA_VERSION,
  CURRENT_RULE_VERSION
} from '../contracts/envelope.ts';
import { evaluateEligibility } from '../domain/eligibility.ts';
import { rankEligibleCandidates } from '../domain/ranking.ts';
import { type StagedCrawlerOffer, validateStagedCrawlerOffer } from '../contracts/crawler.ts';
import { type ProductVariant } from '../contracts/catalog.ts';

export function createHttpServer(
  store: AdviserSqliteStore | AdviserPostgresStore,
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
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let rejected = false;
        req.on('data', chunk => {
          if (rejected) return;
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buf.length;
          if (totalBytes > 1_000_000) {
            rejected = true;
            const err: any = new Error('Payload Too Large');
            err.statusCode = 413;
            err.code = 'ERR_PAYLOAD_TOO_LARGE';
            reject(err);
            return;
          }
          chunks.push(buf);
        });
        req.on('end', () => {
          if (rejected) return;
          const raw = Buffer.concat(chunks).toString('utf8');
          if (raw.length === 0) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(raw));
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
        if ('health' in store) return sendJson(200, await store.health());
        return sendJson(200, {
          status: 'ok',
          catalogVersion: await store.getActiveCatalogVersion(),
          timestamp: new Date().toISOString()
        });
      }

      if (method === 'GET' && new URL(url,'http://localhost').pathname === '/advisor/v1/catalog' && 'catalog' in store) {
        const query = new URL(url,'http://localhost').searchParams.get('q') || '';
        if (query.length > 200) return sendJson(400,{error:{message:'Search query too long'}});
        return sendJson(200, await store.catalog(query));
      }

      // 2. Crawler Staging Ingest
      if (method === 'POST' && url === '/advisor/v1/ingest') {
        const body = await readBody();
        if (!body || typeof body !== 'object') {
          return sendJson(400, {
            error: {
              code: 'ERR_INVALID_PAYLOAD',
              message: 'Payload must be an object with an offers array or an array of offers',
              retryable: false
            }
          });
        }
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

        // Validate that each matchedVariantId exists in active catalog
        const activeVariants: ProductVariant[] = 'catalog' in store ? (await store.catalog()).variants : await store.getVariantsForActiveCatalog();
        const knownVariantIds = new Set(activeVariants.map(v => v.variantId));
        for (const o of offers) {
          if (!knownVariantIds.has(o.matchedVariantId)) {
            return sendJson(400, {
              error: {
                code: 'ERR_UNKNOWN_VARIANT',
                message: `matchedVariantId '${o.matchedVariantId}' does not match any variant in active catalog`,
                retryable: false
              }
            });
          }
        }

        await store.saveOffers(offers);
        return sendJson(200, { status: 'accepted', count: offers.length });
      }

      // 3. Recommendation Request
      if (method === 'POST' && url === '/advisor/v1/recommend') {
        const envelope = (await readBody()) as RecommendationRequestEnvelope;
        if (!envelope || typeof envelope !== 'object') return sendJson(400,{error:{code:'ERR_INVALID_PROFILE',message:'Object required'}});

        // Metadata validation
        if (
          !envelope ||
          typeof envelope !== 'object' ||
          Array.isArray(envelope) ||
          !envelope.requestId ||
          !envelope.decisionId
        ) {
          return sendJson(400, {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            requestId: envelope?.requestId || 'unknown',
            decisionId: envelope?.decisionId || 'unknown',
            profileRevision: envelope?.profileRevision || 0,
            catalogVersion: (await store.getActiveCatalogVersion()) || 'none',
            ruleVersion: CURRENT_RULE_VERSION,
            status: 'ERR_INVALID_PROFILE',
            shortlist: [],
            excludedVariants: [],
            error: {
              code: 'ERR_INVALID_PROFILE',
              message: 'Missing or invalid envelope metadata (requestId and decisionId required)',
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
            catalogVersion: await store.getActiveCatalogVersion() || 'none',
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
        const catalogData = 'catalog' in store ? await store.catalog() : null;
        const activeCatalog = catalogData?.catalogVersion ?? await store.getActiveCatalogVersion();
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
        const variants: import('../contracts/catalog.ts').ProductVariant[] = catalogData?.variants ?? await store.getVariantsForActiveCatalog();
        const eligibleList = [];
        const excludedList = [];
        const offersByVariant = 'getOffersForVariants' in store
          ? await store.getOffersForVariants(variants.map(variant => variant.variantId))
          : null;

        for (const variant of variants) {
          const offers = offersByVariant ? offersByVariant.get(variant.variantId) ?? [] : await store.getOffersForVariant(variant.variantId);
          const eligibility = evaluateEligibility(variant, offers, envelope.profile);
          if (eligibility.isEligible) {
            eligibleList.push({ variant, eligibility });
          } else if (eligibility.exclusion) {
            excludedList.push(eligibility.exclusion);
          }
        }

        // Rank candidates
        const shortlist = rankEligibleCandidates(eligibleList, envelope.profile);
        const noOfferIds = new Set(excludedList.filter(candidate => candidate.reasonCode === 'NO_OFFERS').map(candidate => candidate.variantId));
        const referenceCandidates = variants.filter(variant => noOfferIds.has(variant.variantId));

        let status: ResponseStatus;
        if (shortlist.some(c => c.isVerifiedAffordable)) {
          status = 'SUCCESS';
        } else if (shortlist.length > 0) {
          status = 'NO_VERIFIED_OFFER';
        } else if (excludedList.some(e => e.reasonCode === 'NO_OFFERS')) {
          status = 'NO_VERIFIED_OFFER';
        } else {
          status = 'NO_FIT';
        }

        const responseEnv: RecommendationResponseEnvelope = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          requestId: envelope.requestId,
          decisionId: envelope.decisionId,
          profileRevision: envelope.profileRevision,
          catalogVersion: activeCatalog,
          ruleVersion: CURRENT_RULE_VERSION,
          status,
          shortlist,
          referenceCandidates,
          excludedVariants: excludedList
        };

        return sendJson(200, responseEnv);
      }

      // 404 for unknown routes
      return sendJson(404, { error: 'Not Found' });
    } catch (err: any) {
      const statusCode = err?.statusCode || 500;
      const code = err?.code || (statusCode === 500 ? 'ERR_INTERNAL' : (statusCode === 409 ? 'ERR_CONFLICT' : 'ERR_BAD_REQUEST'));
      return sendJson(statusCode, {
        error: {
          code,
          message: statusCode >= 500 ? 'Service temporarily unavailable' : err?.message || 'Invalid request',
          retryable: false
        }
      });
    }
  });
}
