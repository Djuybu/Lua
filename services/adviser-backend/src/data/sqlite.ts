/**
 * SQLite Persistence Engine for Lua Device Adviser
 * Built on native Node DatabaseSync (zero external binary dependency).
 * Supports durable storage, atomic snapshot activation, rollback on failure,
 * and restart recovery.
 */

import { DatabaseSync } from 'node:sqlite';
import { type SnapshotManifest, type ProductVariant, type FactAssertion } from '../contracts/catalog.ts';
import { type StagedCrawlerOffer, getStableOfferId, getObservationId } from '../contracts/crawler.ts';
import { type ConfirmedNeedsProfile } from '../contracts/taxonomy.ts';

export interface SavedDecisionRecord {
  decisionId: string;
  profileRevision: number;
  profile: ConfirmedNeedsProfile;
  selectedVariantId: string;
  savedAt: string;
}

export class AdviserSqliteStore {
  private db: DatabaseSync;

  constructor(location: string = ':memory:') {
    this.db = new DatabaseSync(location);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS catalog_snapshots (
        catalog_version TEXT PRIMARY KEY,
        rule_version TEXT NOT NULL,
        status TEXT NOT NULL, -- 'active', 'staged', 'archived'
        published_at TEXT NOT NULL,
        activated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS variants (
        variant_id TEXT NOT NULL,
        catalog_version TEXT NOT NULL,
        family_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        category TEXT NOT NULL,
        brand TEXT NOT NULL,
        specs_json TEXT NOT NULL,
        fact_ids_json TEXT NOT NULL,
        PRIMARY KEY (variant_id, catalog_version)
      );

      CREATE TABLE IF NOT EXISTS facts (
        fact_id TEXT NOT NULL,
        catalog_version TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        claim_text TEXT NOT NULL,
        source_doc TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        PRIMARY KEY (fact_id, catalog_version)
      );

      CREATE TABLE IF NOT EXISTS staged_offers (
        source_id TEXT NOT NULL,
        external_offer_id TEXT NOT NULL,
        matched_variant_id TEXT NOT NULL,
        condition TEXT NOT NULL,
        stock_status TEXT NOT NULL,
        base_price_vnd INTEGER NOT NULL,
        mandatory_fees_vnd INTEGER,
        shipping_vnd INTEGER,
        conditional_discount_vnd INTEGER NOT NULL,
        source_url TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        completeness_status TEXT NOT NULL,
        PRIMARY KEY (source_id, external_offer_id, observed_at)
      );

      CREATE TABLE IF NOT EXISTS saved_decisions (
        decision_id TEXT NOT NULL,
        profile_revision INTEGER NOT NULL,
        profile_json TEXT NOT NULL,
        selected_variant_id TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        PRIMARY KEY (decision_id, profile_revision)
      );
    `);
  }

  /**
   * Atomically imports and activates a new catalog snapshot.
   * If any step fails or injectFail is true, rolls back 100% leaving previous active catalog intact.
   */
  public activateSnapshot(manifest: SnapshotManifest, options: { injectFail?: boolean } = {}): void {
    this.db.exec('BEGIN TRANSACTION');
    try {
      // 1. Mark existing active as archived
      this.db.exec("UPDATE catalog_snapshots SET status = 'archived' WHERE status = 'active'");

      // 2. Insert new snapshot header
      const insertSnapshot = this.db.prepare(`
        INSERT INTO catalog_snapshots (catalog_version, rule_version, status, published_at, activated_at)
        VALUES (?, ?, 'active', ?, ?)
      `);
      insertSnapshot.run(
        manifest.catalogVersion,
        manifest.ruleVersion,
        manifest.publishedAt,
        new Date().toISOString()
      );

      // 3. Insert variants
      const insertVariant = this.db.prepare(`
        INSERT INTO variants (variant_id, catalog_version, family_id, model_name, category, brand, specs_json, fact_ids_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of manifest.variants) {
        insertVariant.run(
          v.variantId,
          manifest.catalogVersion,
          v.familyId,
          v.modelName,
          v.category,
          v.brand,
          JSON.stringify(v.specifications),
          JSON.stringify(v.factIds)
        );
      }

      // 4. Insert facts
      const insertFact = this.db.prepare(`
        INSERT INTO facts (fact_id, catalog_version, variant_id, domain, claim_text, source_doc, verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const f of manifest.facts) {
        insertFact.run(
          f.factId,
          manifest.catalogVersion,
          f.variantId,
          f.domain,
          f.claimText,
          f.sourceDoc,
          f.verifiedAt
        );
      }

      // 5. Ingest bundled offers
      this.saveOffers(manifest.offers);

      // Injected failure simulation
      if (options.injectFail) {
        throw new Error('Simulated atomic failure during snapshot ingestion');
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Idempotent offer saving into staged_offers table.
   */
  public saveOffers(offers: StagedCrawlerOffer[]): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO staged_offers (
        source_id, external_offer_id, matched_variant_id, condition, stock_status,
        base_price_vnd, mandatory_fees_vnd, shipping_vnd, conditional_discount_vnd,
        source_url, observed_at, completeness_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const o of offers) {
      stmt.run(
        o.sourceId,
        o.externalOfferId,
        o.matchedVariantId,
        o.condition,
        o.stockStatus,
        o.basePriceVnd,
        o.mandatoryFeesVnd,
        o.shippingVnd,
        o.conditionalDiscountVnd,
        o.sourceUrl,
        o.observedAt,
        o.completenessStatus
      );
    }
  }

  public getActiveCatalogVersion(): string | null {
    const row = this.db
      .prepare("SELECT catalog_version FROM catalog_snapshots WHERE status = 'active' LIMIT 1")
      .get() as { catalog_version: string } | undefined;
    return row?.catalog_version ?? null;
  }

  public getVariantsForActiveCatalog(): ProductVariant[] {
    const activeVersion = this.getActiveCatalogVersion();
    if (!activeVersion) return [];

    const rows = this.db
      .prepare('SELECT * FROM variants WHERE catalog_version = ?')
      .all(activeVersion) as Array<{
      variant_id: string;
      family_id: string;
      model_name: string;
      category: string;
      brand: string;
      specs_json: string;
      fact_ids_json: string;
    }>;

    return rows.map(r => ({
      variantId: r.variant_id,
      familyId: r.family_id,
      modelName: r.model_name,
      category: r.category as any,
      brand: r.brand,
      specifications: JSON.parse(r.specs_json),
      factIds: JSON.parse(r.fact_ids_json)
    }));
  }

  public getOffersForVariant(variantId: string): StagedCrawlerOffer[] {
    const rows = this.db
      .prepare('SELECT * FROM staged_offers WHERE matched_variant_id = ? ORDER BY observed_at DESC')
      .all(variantId) as Array<{
      source_id: string;
      external_offer_id: string;
      matched_variant_id: string;
      condition: string;
      stock_status: string;
      base_price_vnd: number;
      mandatory_fees_vnd: number | null;
      shipping_vnd: number | null;
      conditional_discount_vnd: number;
      source_url: string;
      observed_at: string;
      completeness_status: string;
    }>;

    return rows.map(r => ({
      sourceId: r.source_id,
      externalOfferId: r.external_offer_id,
      matchedVariantId: r.matched_variant_id,
      condition: r.condition as any,
      stockStatus: r.stock_status as any,
      basePriceVnd: r.base_price_vnd,
      mandatoryFeesVnd: r.mandatory_fees_vnd,
      shippingVnd: r.shipping_vnd,
      conditionalDiscountVnd: r.conditional_discount_vnd,
      sourceUrl: r.source_url,
      observedAt: r.observed_at,
      completenessStatus: r.completeness_status as any
    }));
  }

  public saveDecision(record: SavedDecisionRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO saved_decisions (decision_id, profile_revision, profile_json, selected_variant_id, saved_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.decisionId,
      record.profileRevision,
      JSON.stringify(record.profile),
      record.selectedVariantId,
      record.savedAt
    );
  }

  public getSavedDecision(decisionId: string): SavedDecisionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM saved_decisions WHERE decision_id = ? ORDER BY profile_revision DESC LIMIT 1')
      .get(decisionId) as {
      decision_id: string;
      profile_revision: number;
      profile_json: string;
      selected_variant_id: string;
      saved_at: string;
    } | undefined;

    if (!row) return null;

    return {
      decisionId: row.decision_id,
      profileRevision: row.profile_revision,
      profile: JSON.parse(row.profile_json),
      selectedVariantId: row.selected_variant_id,
      savedAt: row.saved_at
    };
  }

  public close(): void {
    this.db.close();
  }
}
