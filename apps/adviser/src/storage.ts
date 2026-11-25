import { safeEndpoint, type ConfirmedNeedsProfile } from "./model";
import {
  record,
  text,
  id,
  amount,
  date,
  url,
  profile,
  variant,
  uniqueIds,
} from "./domain/validation";
import { validPriceData } from "./domain/persisted-prices";
import type { Preferences } from "./theme";
import { DEFAULT_API_ENDPOINT } from "./api/config";
const defaults: Preferences = {
  appearance: "system",
  seed: "#6750A4",
  dynamic: true,
  endpoint: DEFAULT_API_ENDPOINT,
};
import { destination } from "./domain/navigation";
import type { ProductVariant } from "./catalog";
import {
  emptyCarts,
  importSaved,
  validCartData,
  type CartData,
} from "./domain/carts";
import type {
  RetailerOffer,
  PriceObservation,
  TrackingRule,
  AlertDelivery,
} from "./domain/price-tracking";
export type Saved = {
  id: string;
  at: string;
  variants: ProductVariant[];
  profile: ConfirmedNeedsProfile | null;
  catalogVersion: string;
  groupName?: string;
  decisionNote?: string;
  baselineAmount?: number | null;
  savedOfferId?: string | null;
  baselinePriceBasis?: "listing" | "complete" | "unknown";
  sourceUrl?: string;
};
export type State = {
  version: 2;
  destination?: "advisor" | "compare" | "carts" | "settings";
  cartData: CartData;
  offers: RetailerOffer[];
  observations: PriceObservation[];
  trackingRules: TrackingRule[];
  alertDeliveries: AlertDelivery[];
  legacyRaw?: string;
  preferences: Preferences;
  confirmed: ConfirmedNeedsProfile | null;
  revision: number;
  saved: Saved[];
};
export const empty: State = {
  version: 2,
  cartData: emptyCarts,
  offers: [],
  observations: [],
  trackingRules: [],
  alertDeliveries: [],
  preferences: defaults,
  confirmed: null,
  revision: 0,
  saved: [],
};
const key = "lua-adviser-v1";
function validSaved(s: unknown): s is Saved {
  return (
    record(s) &&
    id(s.id) &&
    date(s.at) &&
    Array.isArray(s.variants) &&
    s.variants.every(variant) &&
    new Set(s.variants.map((v) => v.variantId)).size === s.variants.length &&
    (s.profile === null || profile(s.profile)) &&
    id(s.catalogVersion) &&
    [s.groupName, s.decisionNote].every((x) => x === undefined || text(x)) &&
    (s.baselineAmount === undefined ||
      s.baselineAmount === null ||
      amount(s.baselineAmount)) &&
    (s.savedOfferId === undefined ||
      s.savedOfferId === null ||
      id(s.savedOfferId)) &&
    (s.baselinePriceBasis === undefined ||
      ["listing", "complete", "unknown"].includes(s.baselinePriceBasis)) &&
    (s.sourceUrl === undefined || url(s.sourceUrl))
  );
}
export function validState(x: unknown): x is State {
  return (
    record(x) &&
    x.version === 2 &&
    validCartData(x.cartData) &&
    validPriceData(x, x.cartData) &&
    Number.isSafeInteger(x.revision) &&
    x.revision >= 0 &&
    (x.confirmed === null || profile(x.confirmed)) &&
    (x.destination === undefined ||
      ["advisor", "compare", "carts", "settings"].includes(x.destination)) &&
    (x.legacyRaw === undefined || text(x.legacyRaw)) &&
    record(x.preferences) &&
    ["system", "light", "dark"].includes(x.preferences?.appearance) &&
    text(x.preferences.seed) &&
    /^#[0-9a-f]{6}$/i.test(x.preferences.seed) &&
    typeof x.preferences?.dynamic === "boolean" &&
    typeof x.preferences?.endpoint === "string" &&
    (x.preferences.endpoint === "" || safeEndpoint(x.preferences.endpoint)) &&
    (x.preferences.locale === undefined ||
      ["vi", "en"].includes(x.preferences.locale)) &&
    (x.preferences.motion === undefined ||
      ["system", "reduced"].includes(x.preferences.motion)) &&
    (x.preferences.offlineAiOnly === undefined ||
      typeof x.preferences.offlineAiOnly === "boolean") &&
    Array.isArray(x.saved) &&
    x.saved.every(validSaved) &&
    uniqueIds(x.saved) &&
    Object.keys(x.cartData.legacyMap).every((key) =>
      x.saved.some((s: Saved) => s.id === key),
    )
  );
}
export function createStore(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}) {
  let state = structuredClone(empty);
  let blocked = true;
  let tail = Promise.resolve();
  return {
    load() {
      const next = tail.then(async () => {
        blocked = true;
        const raw = await storage.getItem(key);
        if (raw === null) {
          state = structuredClone(empty);
          blocked = false;
          return structuredClone(state);
        }
        const parsed = JSON.parse(raw);
        if (parsed?.version === 1) {
          if (!Array.isArray(parsed.saved) || !parsed.saved.every(validSaved))
            throw Error("Invalid legacy snapshots");
          const importedCarts = importSaved(parsed.saved ?? []);
          const rawEndpoint = parsed.preferences?.endpoint;
          const endpoint =
            typeof rawEndpoint === "string" &&
            (rawEndpoint === "" || safeEndpoint(rawEndpoint))
              ? rawEndpoint
              : DEFAULT_API_ENDPOINT;
          const migrated = {
            ...empty,
            ...parsed,
            version: 2,
            destination: destination(parsed.destination ?? parsed.tab),
            cartData: importedCarts,
            offers: [],
            observations: [],
            trackingRules: importedCarts.candidates.map((candidate) => ({
              id: "off:" + candidate.id,
              candidateId: candidate.id,
              status: "off",
              offerScope: [],
              targetAmount: null,
              currency: "VND",
              notificationsEnabled: false,
              createdAt: candidate.savedAt,
              updatedAt: candidate.savedAt,
            })),
            alertDeliveries: [],
            legacyRaw: raw,
            preferences: {
              ...defaults,
              ...parsed.preferences,
              endpoint,
            },
          };
          if (!validState(migrated)) throw Error("Invalid legacy data");
          await storage.setItem(key, JSON.stringify(migrated));
          state = migrated;
        } else {
          if (!validState(parsed)) throw new Error("Dữ liệu lưu không hợp lệ.");
          state = parsed;
        }
        blocked = false;
        return structuredClone(state);
      });
      tail = next.then(
        () => {},
        () => {},
      );
      return next;
    },
    update(fn: (s: State) => State) {
      const result = tail.then(async () => {
        if (blocked)
          throw new Error("Dữ liệu chưa được khôi phục; đang khóa ghi.");
        const next = structuredClone(fn(structuredClone(state)));
        if (!validState(next)) throw new Error("Dữ liệu không hợp lệ.");
        await storage.setItem(key, JSON.stringify(next));
        state = next;
        return structuredClone(state);
      });
      tail = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    async exportRaw() {
      return await storage.getItem(key);
    },
    async recover() {
      await tail;
      await storage.setItem(key, JSON.stringify(empty));
      state = structuredClone(empty);
      blocked = false;
      return structuredClone(state);
    },
  };
}
