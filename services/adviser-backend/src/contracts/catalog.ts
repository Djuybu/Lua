/**
 * Catalog & Variant Contracts for Lua Device Adviser
 */

import { type DeviceCategory } from './taxonomy.ts';
import { type StagedCrawlerOffer } from './crawler.ts';

export interface ProductVariant {
  sourceUrl?: string;
  observedAt?: string;
  observedPriceVnd?: number | null;
  dataStatus?: string;
  variantId: string;
  familyId: string;
  modelName: string;
  category: DeviceCategory | 'unknown';
  brand: string;
  specifications: {
    ramGb: number | null;
    os: string;
    storageGb: number | null;
    cpu: string;
    gpu?: string;
    weightKg?: number;
    displayInches?: number;
    batteryWattHours?: number;
  };
  /** Verified capability facts associated with this exact variant */
  factIds: string[];
}

export interface FactAssertion {
  factId: string;
  variantId: string;
  domain: 'performance' | 'battery' | 'mobility' | 'screen' | 'durability';
  claimText: string;
  sourceDoc: string;
  verifiedAt: string;
}

export interface SnapshotManifest {
  schemaVersion: string;
  catalogVersion: string;
  ruleVersion: string;
  publishedAt: string;
  variants: ProductVariant[];
  facts: FactAssertion[];
  offers: StagedCrawlerOffer[];
}
