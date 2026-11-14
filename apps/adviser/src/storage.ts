import type { ConfirmedNeedsProfile } from "./model";
import { validateConfirmedProfile } from "./model";
import type { Preferences } from "./theme";
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
import { DEFAULT_API_ENDPOINT } from "./api/config";
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
export function validState(x: any): x is State {
  return (
    x?.version === 2 &&
    validCartData(x.cartData) &&
    Array.isArray(x.offers) &&
    Array.isArray(x.observations) &&
    Array.isArray(x.trackingRules) &&
    Array.isArray(x.alertDeliveries) &&
    Number.isSafeInteger(x.revision) &&
    x.revision >= 0 &&
    (!x.confirmed || validateConfirmedProfile(x.confirmed).valid) &&
    ["system", "light", "dark"].includes(x.preferences?.appearance) &&
    /^#[0-9a-f]{6}$/i.test(x.preferences?.seed) &&
    typeof x.preferences?.dynamic === "boolean" &&
    typeof x.preferences?.endpoint === "string" &&
    (x.preferences.locale === undefined ||
      ["vi", "en"].includes(x.preferences.locale)) &&
    (x.preferences.motion === undefined ||
      ["system", "reduced"].includes(x.preferences.motion)) &&
    (x.preferences.offlineAiOnly === undefined ||
      typeof x.preferences.offlineAiOnly === "boolean") &&
    Array.isArray(x.saved) &&
    x.saved.every(
      (s: any) =>
        typeof s.id === "string" &&
        typeof s.at === "string" &&
        Array.isArray(s.variants) &&
        s.variants.every(
          (v: any) =>
            typeof v.variantId === "string" &&
            typeof v.modelName === "string" &&
            v.specifications,
        ),
    ) &&
    new Set(x.saved.map((s: any) => s.id)).size === x.saved.length
  );
}
export function createStore(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}) {
  let state = empty;
  let blocked = true;
  let tail = Promise.resolve();
  return {
    async load() {
      const raw = await storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.version === 1) {
          const migrated = {
            ...empty,
            ...parsed,
            version: 2,
            destination: destination(parsed.destination ?? parsed.tab),
            cartData: importSaved(parsed.saved ?? []),
            offers: [],
            observations: [],
            trackingRules: importSaved(parsed.saved ?? []).candidates.map(
              (candidate) => ({
                id: "off:" + candidate.id,
                candidateId: candidate.id,
                status: "off",
                offerScope: [],
                targetAmount: null,
                currency: "VND",
                notificationsEnabled: false,
                createdAt: candidate.savedAt,
                updatedAt: candidate.savedAt,
              }),
            ),
            alertDeliveries: [],
            legacyRaw: raw,
            preferences: {
              ...defaults,
              ...parsed.preferences,
              endpoint: DEFAULT_API_ENDPOINT,
            },
          };
          if (!validState(migrated)) throw Error("Invalid legacy data");
          await storage.setItem(key, JSON.stringify(migrated));
          state = migrated;
        } else {
          if (!validState(parsed)) throw new Error("Dữ liệu lưu không hợp lệ.");
          state = parsed;
        }
      }
      blocked = false;
      return state;
    },
    update(fn: (s: State) => State) {
      const result = tail.then(async () => {
        if (blocked)
          throw new Error("Dữ liệu chưa được khôi phục; đang khóa ghi.");
        const next = fn(state);
        if (!validState(next)) throw new Error("Dữ liệu không hợp lệ.");
        await storage.setItem(key, JSON.stringify(next));
        state = next;
        return state;
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
      state = empty;
      blocked = false;
      return state;
    },
  };
}
