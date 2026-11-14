/**
 * Ingest Engine for Staged Crawler Data
 * Handles validation, idempotency, observation history, and variant linking.
 */

import {
  type StagedCrawlerOffer,
  validateStagedCrawlerOffer,
  getStableOfferId,
  getObservationId
} from '../contracts/crawler.ts';

export interface IngestReport {
  totalProcessed: number;
  accepted: number;
  duplicateIgnored: number;
  rejected: number;
  rejectedReasons: Array<{ offerId: string; reason: string }>;
}

export class StagingIngestStore {
  /** Map of observationId -> StagedCrawlerOffer */
  private observations = new Map<string, StagedCrawlerOffer>();
  /** Map of stableOfferId -> latest StagedCrawlerOffer */
  private latestOffers = new Map<string, StagedCrawlerOffer>();
  /** Set of known exact variant IDs in catalog */
  private knownVariantIds = new Set<string>();

  constructor(initialVariantIds?: string[]) {
    if (initialVariantIds) {
      this.setKnownVariants(initialVariantIds);
    }
  }

  public setKnownVariants(variantIds: string[]): void {
    this.knownVariantIds = new Set(variantIds);
  }

  /**
   * Ingests a list of staged crawler offers idempotently.
   */
  public ingest(offers: unknown[]): IngestReport {
    const report: IngestReport = {
      totalProcessed: offers.length,
      accepted: 0,
      duplicateIgnored: 0,
      rejected: 0,
      rejectedReasons: []
    };

    for (let i = 0; i < offers.length; i++) {
      const raw = offers[i];
      const validation = validateStagedCrawlerOffer(raw);
      if (!validation.valid) {
        report.rejected++;
        report.rejectedReasons.push({
          offerId: `index_${i}`,
          reason: validation.errors.join('; ')
        });
        continue;
      }

      const offer = raw as StagedCrawlerOffer;

      // Check variant existence
      if (this.knownVariantIds.size > 0 && !this.knownVariantIds.has(offer.matchedVariantId)) {
        report.rejected++;
        report.rejectedReasons.push({
          offerId: `${offer.sourceId}::${offer.externalOfferId}`,
          reason: `matchedVariantId '${offer.matchedVariantId}' does not match any known catalog variant`
        });
        continue;
      }

      const obsId = getObservationId(offer);
      if (this.observations.has(obsId)) {
        // Idempotent duplicate: already ingested this observation at this timestamp
        report.duplicateIgnored++;
        continue;
      }

      // Record observation
      this.observations.set(obsId, offer);

      // Update latest offer for the stable offer ID if this is newer
      const stableId = getStableOfferId(offer);
      const existingLatest = this.latestOffers.get(stableId);
      if (!existingLatest || Date.parse(offer.observedAt) >= Date.parse(existingLatest.observedAt)) {
        this.latestOffers.set(stableId, offer);
      }

      report.accepted++;
    }

    return report;
  }

  public getLatestOffersForVariant(variantId: string): StagedCrawlerOffer[] {
    const results: StagedCrawlerOffer[] = [];
    for (const offer of this.latestOffers.values()) {
      if (offer.matchedVariantId === variantId) {
        results.push(offer);
      }
    }
    return results;
  }

  public getAllObservations(): StagedCrawlerOffer[] {
    return Array.from(this.observations.values());
  }

  public getLatestOffers(): StagedCrawlerOffer[] {
    return Array.from(this.latestOffers.values());
  }

  public getObservationCount(): number {
    return this.observations.size;
  }
}
