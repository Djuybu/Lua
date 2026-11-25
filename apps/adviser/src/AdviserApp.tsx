import { officialOffer, offerTotal, sourceLabel } from "./domain/official";
import { destination } from "./domain/navigation";
import { probeCapabilities } from "./api/capabilities";
import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import House from "lucide-react-native/icons/house";
import Columns2 from "lucide-react-native/icons/columns-2";
import ShoppingCart from "lucide-react-native/icons/shopping-cart";
import Settings from "lucide-react-native/icons/settings";
import { AdvisorTheme, useTheme, type Preferences } from "./theme";
import { LocaleProvider, useLocale } from "./i18n";
import { Body, Button, Chip, Notice, Title, s } from "./ui";
import { createStore, empty, type State } from "./storage";
import {
  initialDraft,
  profileOf,
  draftErrors,
  categories,
  labels,
  vnd,
  formatObservedAt,
  outcome,
  type Draft,
} from "./model";
import type { ProductVariant, SnapshotManifest } from "./catalog";
import type { RecommendationResponseEnvelope } from "./envelope";
import seed from "./catalog.json";
import { loadCatalog, recommend } from "./api";
import { DEFAULT_API_ENDPOINT } from "./api/config";
import { recordError } from "./utils/error-logger";
import { shareOrDownloadJson } from "./utils/share";
import { ChatPanel } from "./ChatPanel";
import { commitProposal, type ChatTransport, type ChatProposal } from "./chat";
import {
  emptyFilters,
  filterVariants,
  countFilters,
  normalizeBrand,
  pricingMetadata,
  type Filters,
} from "./domain/filters";
import { emptyCarts } from "./domain/carts";
import { PSREFListingCard } from "./components/PSREFListingCard";
import { FloatingSearchBar } from "./components/FloatingSearchBar";
import {
  UnifiedFilterPanel,
  applyConfirmedFilter,
} from "./components/UnifiedFilterPanel";
import { AddToCartModal } from "./components/AddToCartModal";
import { NeedsModal } from "./screens/NeedsModal";
import { DeviceDetailModal } from "./screens/DeviceDetailModal";
import { CartsScreen } from "./screens/CartsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ComparisonView } from "./ComparisonView";
import { CatalogProvider } from "./catalog-context";

const bundledCatalog = seed as SnapshotManifest;
const store = createStore(AsyncStorage);
const ListGap = () => <View style={{ height: 16 }} />;

const destinations = [
  { id: "advisor", label: "Trang chủ", icon: House },
  { id: "compare", label: "So sánh", icon: Columns2 },
  { id: "carts", label: "Giỏ hàng", icon: ShoppingCart },
  { id: "settings", label: "Cài đặt", icon: Settings },
] as const;
type Tab = (typeof destinations)[number]["id"];

export default function AdviserApp({
  chatTransport,
  explanationEndpoint,
}: { chatTransport?: ChatTransport; explanationEndpoint?: string } = {}) {
  const [state, setState] = useState<State>(empty);
  const [boot, setBoot] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    store
      .load()
      .then((x) => {
        setState(x);
        setBoot("ready");
      })
      .catch(() => {
        recordError("storage", "RESTORE_FAILED");
        setBoot("failed");
      });
  }, []);
  async function update(fn: (x: State) => State) {
    if (boot !== "ready") throw Error("STORE_NOT_READY");
    try {
      const next = await store.update(fn);
      setState(next);
      return next;
    } catch (e) {
      recordError("storage", "WRITE_FAILED");
      throw e;
    }
  }
  return (
    <SafeAreaProvider>
      <LocaleProvider locale={state.preferences.locale ?? "vi"}>
        <AdvisorTheme preferences={state.preferences}>
          <Workspace
            explanationEndpoint={explanationEndpoint}
            state={state}
            boot={boot}
            update={update}
            chatTransport={
              state.preferences.offlineAiOnly ? undefined : chatTransport
            }
            recover={async () => {
              setState(await store.recover());
              setBoot("ready");
            }}
          />
        </AdvisorTheme>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

function Workspace({
  explanationEndpoint,
  state,
  boot,
  update,
  chatTransport,
  recover,
}: {
  state: State;
  boot: string;
  update: (fn: (x: State) => State) => Promise<State>;
  chatTransport?: ChatTransport;
  explanationEndpoint?: string;
  recover: () => Promise<void>;
}) {
  const { c, isDark } = useTheme();
  const { t, locale } = useLocale();
  const { width, height } = useWindowDimensions();
  const rail = width >= 840 || (width >= 600 && height >= 600);
  const expanded = width >= 840;

  const [catalog, setCatalog] = useState<SnapshotManifest>(bundledCatalog);
  const [catalogStatus, setCatalogStatus] = useState<
    "loading" | "live" | "bundled"
  >("loading");
  const [catalogRefresh, setCatalogRefresh] = useState(0);

  useEffect(() => {
    if (boot === "loading") return;
    if (!DEFAULT_API_ENDPOINT || state.preferences.offlineAiOnly) {
      setCatalog(bundledCatalog);
      setCatalogStatus("bundled");
      return;
    }
    setCatalogStatus("loading");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    loadCatalog(DEFAULT_API_ENDPOINT, controller.signal)
      .then((manifest) => {
        setCatalog(manifest);
        setCatalogStatus("live");
      })
      .catch(() => {
        recordError("network", "CATALOG_UNAVAILABLE");
        setCatalog(bundledCatalog);
        setCatalogStatus("bundled");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [boot, state.preferences.offlineAiOnly, catalogRefresh]);

  const [priceTracking, setPriceTracking] = useState(false);
  useEffect(() => {
    setPriceTracking(false);
    if (
      catalogStatus === "loading" ||
      !DEFAULT_API_ENDPOINT ||
      state.preferences.offlineAiOnly
    )
      return;
    const a = new AbortController();
    const timer = setTimeout(() => a.abort(), 4000);
    probeCapabilities(DEFAULT_API_ENDPOINT, a.signal)
      .then((x) => {
        if (!a.signal.aborted) setPriceTracking(x.priceTracking);
      })
      .catch(() => {
        recordError("network", "HEALTH_UNAVAILABLE");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      a.abort();
    };
  }, [catalogStatus, state.preferences.offlineAiOnly]);

  const [tab, setTab] = useState<Tab>("advisor");
  const restoredTab = useRef(false);
  useEffect(() => {
    if (boot === "ready" && !restoredTab.current) {
      restoredTab.current = true;
      setTab(destination(state.destination));
    }
  }, [boot, state.destination]);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [catalogPage, setCatalogPage] = useState(0);
  const contentScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const catalogPageSize = 24;
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [gridWidth, setGridWidth] = useState(width - 48);
  const [detail, setDetail] = useState<ProductVariant | null>(null);
  const [historical, setHistorical] = useState(false);
  const [compare, setCompare] = useState<ProductVariant[]>([]);
  const [addVariants, setAddVariants] = useState<ProductVariant[] | null>(null);
  const [intake, setIntake] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [deleteAll, setDeleteAll] = useState(false);
  const [reset, setReset] = useState(false);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [result, setResult] = useState<RecommendationResponseEnvelope | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState("");
  const ticket = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const mutation = useRef(false);

  useEffect(() => {
    const byId = new Map(catalog.variants.map((v) => [v.variantId, v]));
    setCompare((xs) => xs.map((x) => byId.get(x.variantId) ?? x));
    setDetail((d) => (d && !historical ? byId.get(d.variantId) ?? d : d));
  }, [catalog.variants, historical]);

  useEffect(
    () => () => {
      ticket.current++;
      abort.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (chatOpen) {
        setChatOpen(false);
        return true;
      }
      if (tab !== "advisor") {
        setTab("advisor");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [chatOpen, tab]);

  useEffect(() => {
    if (Platform.OS !== "web" || !chatOpen || typeof window === "undefined")
      return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chatOpen]);

  function switchTab(next: Tab) {
    setTab(next);
    setNotice("");
    if (boot === "ready" && !mutation.current && state.destination !== next) {
      void update((x) => ({ ...x, destination: next })).catch(() => {});
    }
  }

  async function mutate(fn: (s: State) => State, ack = "") {
    if (mutation.current) throw Error("BUSY");
    mutation.current = true;
    setPending(true);
    try {
      const next = await update(fn);
      if (ack) setNotice(ack);
      return next;
    } catch {
      setNotice("Không lưu được. Dữ liệu cũ được giữ nguyên.");
      throw Error("WRITE_FAILED");
    } finally {
      mutation.current = false;
      setPending(false);
    }
  }

  async function prefs(p: Partial<Preferences>) {
    try {
      await mutate(
        (x) => ({ ...x, preferences: { ...x.preferences, ...p } }),
        "Đã lưu tùy chọn.",
      );
    } catch {}
  }

  async function evaluate(
    profile = state.confirmed,
    revision = state.revision,
  ) {
    const id = ++ticket.current;
    abort.current?.abort();
    setNetworkError("");
    if (!profile || !DEFAULT_API_ENDPOINT || state.preferences.offlineAiOnly)
      return;
    const a = new AbortController();
    abort.current = a;
    setLoading(true);
    const timer = setTimeout(() => a.abort(), 10000);
    try {
      const data = await recommend(
        DEFAULT_API_ENDPOINT,
        profile,
        revision,
        String(id),
        a.signal,
        catalog.catalogVersion,
        catalog.ruleVersion,
      );
      if (id === ticket.current) setResult(data);
    } catch {
      if (id === ticket.current) {
        recordError("network", "RECOMMEND_FAILED");
        setNetworkError("Không tải được kết quả. Nhu cầu vẫn được giữ.");
      }
    } finally {
      clearTimeout(timer);
      if (id === ticket.current) setLoading(false);
    }
  }

  function openNeeds() {
    const p = state.confirmed;
    setDraft(
      p
        ? {
            category: p.category,
            purposes: [...p.orderedPurposes],
            priorities: [...p.orderedPriorities],
            budget: String(p.budget.hardCeilingVnd),
            minRam: p.hardConstraints?.minRamGb
              ? String(p.hardConstraints.minRamGb)
              : "",
            os: p.hardConstraints?.requiredOs?.[0] ?? "",
          }
        : { ...initialDraft, purposes: [], priorities: [] },
    );
    setErrors([]);
    setStep(0);
    setIntake(true);
  }

  async function confirm() {
    if (draftErrors(draft).length) {
      setErrors([
        "Chọn đúng ba mục đích, ba ưu tiên; nhập ngân sách và RAM hợp lệ.",
      ]);
      return;
    }
    try {
      const p = profileOf(draft);
      const next = await mutate(
        (x) => ({ ...x, confirmed: p, revision: x.revision + 1 }),
        "Đã xác nhận nhu cầu.",
      );
      setIntake(false);
      setResult(null);
      switchTab("advisor");
      void evaluate(p, next.revision);
    } catch {
      setErrors(["Không thể lưu nhu cầu. Bản nháp vẫn được giữ."]);
    }
  }

  function select(v: ProductVariant) {
    setCompare((xs) => {
      if (xs.some((x) => x.variantId === v.variantId))
        return xs.filter((x) => x.variantId !== v.variantId);
      if (xs.length >= 4) {
        setNotice("Đã đạt giới hạn 4 máy so sánh.");
        return xs;
      }
      return [...xs, v];
    });
  }

  function openAdd(v: ProductVariant[]) {
    setDetail(null);
    setAddVariants(v);
  }

  const compareIds = useMemo(
    () => new Set(compare.map((x) => x.variantId)),
    [compare],
  );

  const fitOrder = useMemo(() => {
    if (!result?.shortlist.length) return undefined;
    const map: Record<string, number> = {};
    result.shortlist.forEach((c, idx) => {
      map[c.variantId] = idx;
    });
    return map;
  }, [result]);

  const priceMetadata = useMemo(() => {
    const out: Record<
      string,
      { price: number | null; total: number | null; condition: string | null }
    > = {};
    for (const v of catalog.variants) {
      if (v.observedPriceVnd != null) {
        out[v.variantId] = {
          price: v.observedPriceVnd,
          total: null,
          condition: null,
        };
      }
    }
    const persisted = pricingMetadata(state.offers, state.observations);
    for (const [vid, meta] of Object.entries(persisted)) {
      const prev = out[vid] ?? { price: null, total: null, condition: null };
      out[vid] = {
        price: meta.price ?? prev.price,
        total: meta.total ?? prev.total,
        condition: meta.condition ?? prev.condition,
      };
    }
    for (const v of catalog.variants) {
      const o = officialOffer(catalog, v.variantId);
      if (o) {
        out[v.variantId] = {
          price: o.basePriceVnd,
          total: offerTotal(o),
          condition: o.condition === "NEW" ? "new" : "used",
        };
      }
    }
    return out;
  }, [catalog, state.offers, state.observations]);

  const filtered = useMemo(
    () =>
      applyConfirmedFilter(
        filterVariants(
          catalog.variants,
          filters,
          deferredQuery,
          priceMetadata,
          fitOrder,
        ),
        filters.showExcluded,
        state.confirmed,
        priceMetadata,
      ),
    [catalog.variants, filters, deferredQuery, priceMetadata, fitOrder, state.confirmed],
  );

  useEffect(() => {
    setCatalogPage(0);
  }, [filters, deferredQuery, catalog.catalogVersion]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / catalogPageSize));
  const currentPage = Math.min(catalogPage, pageCount - 1);
  const pageVariants = filtered.slice(
    currentPage * catalogPageSize,
    (currentPage + 1) * catalogPageSize,
  );
  function changeCatalogPage(page: number) {
    setCatalogPage(page);
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }

  const badgeCountFor = (id: Tab) => {
    if (id === "compare" && compare.length > 0) return compare.length;
    if (id === "carts" && state.cartData.carts.length > 0)
      return state.cartData.carts.filter((x) => !x.archivedAt).length;
    return 0;
  };

  const nav = (
    <View
      style={{
        flexDirection: rail ? "column" : "row",
        padding: rail ? 10 : 6,
        paddingTop: rail ? 16 : 6,
        gap: rail ? 8 : 4,
        backgroundColor: c.surfaceContainer,
        justifyContent: rail ? "flex-start" : "space-around",
        borderTopWidth: rail ? 0 : 1,
        borderRightWidth: rail ? 1 : 0,
        borderColor: c.outlineVariant,
      }}
    >
      {destinations.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        const badge = badgeCountFor(id);
        if (rail) {
          return (
            <Button
              key={id}
              label={badge > 0 && id === "compare" ? `${t(label)} (${badge}/4)` : label}
              a11yLabel={t(label)}
              selected={active}
              quiet={!active}
              fullWidth
              onPress={() => switchTab(id)}
              icon={
                <Icon
                  size={20}
                  color={active ? c.onPrimary : c.onSurfaceVariant}
                />
              }
            />
          );
        }
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={t(label)}
            accessibilityState={{ selected: active }}
            {...(Platform.OS === "web" ? { "aria-pressed": active } : {})}
            onPress={() => switchTab(id)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 54,
              borderRadius: 16,
              paddingVertical: 6,
              paddingHorizontal: 4,
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              backgroundColor: active ? c.primaryContainer : "transparent",
              opacity: pressed ? 0.8 : 1,
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
            })}
          >
            <View style={{ position: "relative" }}>
              <Icon
                size={21}
                color={active ? c.onPrimaryContainer : c.onSurfaceVariant}
              />
              {badge > 0 && (
                <View
                  accessibilityElementsHidden
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    backgroundColor: c.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: c.onPrimary,
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
                    {badge}
                  </Text>
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{
                textAlign: "center",
                color: active ? c.onPrimaryContainer : c.onSurfaceVariant,
                fontWeight: active ? "700" : "500",
                fontSize: 11,
              }}
            >
              {t(label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.category)
    activeChips.push({
      key: "cat",
      label: t(categories[filters.category as keyof typeof categories] ?? filters.category),
      clear: () => setFilters((f) => ({ ...f, category: "" })),
    });
  for (const src of filters.sources)
    activeChips.push({
      key: "src:" + src,
      label: sourceLabel(src),
      clear: () =>
        setFilters((f) => ({
          ...f,
          sources: f.sources.filter((x) => x !== src),
        })),
    });
  for (const br of filters.brands)
    activeChips.push({
      key: "br:" + br,
      label: normalizeBrand(br),
      clear: () =>
        setFilters((f) => ({
          ...f,
          brands: f.brands.filter((x) => x !== br),
        })),
    });
  if (filters.minPrice || filters.maxPrice)
    activeChips.push({
      key: "price",
      label: `${filters.minPrice ? vnd(Number(filters.minPrice), "") : "0"} – ${filters.maxPrice ? vnd(Number(filters.maxPrice), "") : "∞"}`,
      clear: () => setFilters((f) => ({ ...f, minPrice: "", maxPrice: "" })),
    });
  if (filters.minRam)
    activeChips.push({
      key: "ram",
      label: `RAM ≥ ${filters.minRam} GB`,
      clear: () => setFilters((f) => ({ ...f, minRam: 0 })),
    });
  if (filters.minStorage)
    activeChips.push({
      key: "ssd",
      label: `SSD ≥ ${filters.minStorage} GB`,
      clear: () => setFilters((f) => ({ ...f, minStorage: 0 })),
    });
  if (filters.gpu)
    activeChips.push({
      key: "gpu",
      label: t("Card đồ họa rời"),
      clear: () => setFilters((f) => ({ ...f, gpu: false })),
    });

  return (
    <CatalogProvider manifest={catalog}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View
          accessibilityElementsHidden={chatOpen}
          importantForAccessibility={chatOpen ? "no-hide-descendants" : "auto"}
          {...(Platform.OS === "web" ? ({ "aria-hidden": chatOpen, inert: chatOpen || undefined } as any) : {})}
          style={{ flex: 1 }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottomWidth: 1,
              borderColor: c.outlineVariant,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text
                accessibilityRole="header"
                style={{ fontSize: 26, fontWeight: "800", color: c.onSurface }}
              >
                Lựa<Text style={{ color: c.primary }}>.</Text>
              </Text>
              <Body muted>Chọn có căn cứ</Body>
            </View>
            {tab !== "advisor" && (
              <Button
                quiet
                label="Tư vấn AI"
                onPress={() => {
                  setInitialPrompt(query);
                  setChatOpen(true);
                }}
              />
            )}
          </View>

          <View style={{ flex: 1, flexDirection: "row" }}>
            {rail && nav}
            <View style={{ flex: 1 }}>
              {tab === "advisor" && (
                <FloatingSearchBar
                  query={query}
                  count={countFilters(filters)}
                  onQuery={(q) => setQuery(q)}
                  onFilters={() => setFilterOpen(true)}
                  onAi={() => {
                    setInitialPrompt(query);
                    setChatOpen(true);
                  }}
                />
              )}

              <ScrollView
                ref={contentScroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  padding: 16,
                  paddingBottom: 32,
                  maxWidth: 1120,
                  width: "100%",
                  alignSelf: "center",
                  gap: 14,
                }}
              >
                {boot === "loading" && <ActivityIndicator color={c.primary} />}
                {boot === "failed" && (
                  <Notice live tone="error" title="Cần khôi phục dữ liệu">
                    <View style={s.row}>
                      <Button
                        label="Xuất bản gốc"
                        onPress={async () => {
                          const raw = (await store.exportRaw()) ?? "";
                          await shareOrDownloadJson("lua-recovery.json", raw);
                        }}
                      />
                      <Button
                        label="Xác nhận đặt lại dữ liệu"
                        variant="destructive"
                        onPress={() => setReset(true)}
                      />
                    </View>
                  </Notice>
                )}
                {!!notice && (
                  <Notice live title={notice}>
                    <Button quiet label="Đóng" onPress={() => setNotice("")} />
                  </Notice>
                )}

                {tab === "advisor" && (
                  <View style={s.section}>
                    <View style={s.row}>
                      {catalogStatus === "loading" && (
                        <Chip label="Đang tải danh mục thiết bị…" tone="muted" />
                      )}
                      {catalogStatus === "bundled" && (
                        <>
                          <Chip
                            label={`${t("Danh mục đóng gói")} · ${catalog.variants.length}`}
                            tone="muted"
                          />
                          {!!DEFAULT_API_ENDPOINT &&
                            !state.preferences.offlineAiOnly && (
                              <Button
                                quiet
                                label="Thử kết nối lại"
                                onPress={() => setCatalogRefresh((x) => x + 1)}
                              />
                            )}
                        </>
                      )}
                      {catalogStatus === "live" && (
                        <Chip
                          label={`${t("Danh mục trực tuyến")} · ${catalog.variants.length}`}
                          tone="primary"
                        />
                      )}
                    </View>

                    <Title>Những gì đã biết, và những gì còn thiếu.</Title>
                    <Body muted>Dữ liệu tham khảo, không phải chào bán</Body>
                    <View style={s.row}>
                      <Button
                        selected
                        label={
                          state.confirmed
                            ? "Điều chỉnh nhu cầu"
                            : "Tìm thiết bị cho tôi"
                        }
                        onPress={openNeeds}
                      />
                      {countFilters(filters) > 0 && (
                        <Button
                          label="Xóa bộ lọc"
                          onPress={() =>
                            setFilters(structuredClone(emptyFilters))
                          }
                        />
                      )}
                    </View>

                    {activeChips.length > 0 && (
                      <View style={s.row}>
                        {activeChips.map((chip) => (
                          <Chip
                            key={chip.key}
                            label={`${chip.label} ×`}
                            tone="primary"
                            onPress={chip.clear}
                          />
                        ))}
                      </View>
                    )}

                    {state.confirmed && (
                      <Notice
                        title={
                          t(categories[state.confirmed.category]) +
                          " · " +
                          vnd(
                            state.confirmed.budget.hardCeilingVnd,
                            t("Chưa xác định"),
                          )
                        }
                      >
                        <Body>
                          {state.confirmed.orderedPurposes
                            .map((x) => t(labels[x] ?? "Chưa công bố"))
                            .join(" → ")}
                        </Body>
                        <Button
                          label="Cập nhật kết quả"
                          disabled={
                            loading ||
                            !DEFAULT_API_ENDPOINT ||
                            !!state.preferences.offlineAiOnly
                          }
                          onPress={() => void evaluate()}
                        />
                      </Notice>
                    )}
                    {loading && (
                      <View style={s.row}>
                        <ActivityIndicator color={c.primary} />
                        <Body>Đang tải kết quả…</Body>
                        <Button
                          label="Hủy"
                          onPress={() => {
                            ticket.current++;
                            abort.current?.abort();
                            setLoading(false);
                          }}
                        />
                      </View>
                    )}
                    {!!networkError && (
                      <Notice live tone="error" title={networkError} />
                    )}
                    {result && <Notice title={outcome(result)} />}
                    {result?.shortlist.map((candidate, rank) => {
                      const variant = catalog.variants.find(
                        (v) => v.variantId === candidate.variantId,
                      );
                      const selected = compareIds.has(candidate.variantId);
                      return (
                        <Notice
                          key={candidate.variantId}
                          title={`#${rank + 1} · ${candidate.modelName}`}
                        >
                          <Body>
                            {candidate.totalVnd != null
                              ? vnd(candidate.totalVnd, t("Chưa xác định"))
                              : t("Chưa có giá trọn gói đã xác minh")}
                          </Body>
                          {!!candidate.bestOffer && (
                            <Body muted>
                              {sourceLabel(candidate.bestOffer.sourceId)} ·{" "}
                              {formatObservedAt(
                                candidate.bestOffer.observedAt,
                                locale,
                              )}
                            </Body>
                          )}
                          {candidate.reasons.length > 0 && (
                            <Body muted>{candidate.reasons.join(" · ")}</Body>
                          )}
                          <View style={s.row}>
                            <Button
                              label="Xem cấu hình"
                              disabled={!variant}
                              onPress={() => {
                                if (!variant) return;
                                setHistorical(false);
                                setDetail(variant);
                              }}
                            />
                            <Button
                              label={selected ? "Bỏ chọn" : "So sánh"}
                              selected={selected}
                              disabled={!variant || (!selected && compare.length >= 4)}
                              onPress={() => {
                                if (variant) select(variant);
                              }}
                            />
                          </View>
                          {!variant && (
                            <Body muted>
                              Cấu hình này chưa có trong catalog hiện tại. Vui
                              lòng tải lại trang để cập nhật.
                            </Body>
                          )}
                        </Notice>
                      );
                    })}
                    {result && result.excludedVariants.length > 0 && (
                      <View style={{ gap: 8 }}>
                        <Button
                          quiet
                          label={`${t("Vì sao các máy khác bị loại?")} (${result.excludedVariants.length})`}
                          onPress={() => setExcludedOpen(!excludedOpen)}
                        />
                        {excludedOpen && (
                          <Notice
                            title={`${t("Vì sao các máy khác bị loại?")}`}
                          >
                            {result.excludedVariants.slice(0, 8).map((ex) => (
                              <Body key={ex.variantId} muted>
                                {ex.modelName}: {ex.detail}
                              </Body>
                            ))}
                          </Notice>
                        )}
                      </View>
                    )}

                    <View
                      onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
                    >
                      <FlatList
                        key={expanded ? "two" : "one"}
                        data={pageVariants}
                        numColumns={expanded ? 2 : 1}
                        scrollEnabled={false}
                        keyExtractor={(v) => v.variantId}
                        columnWrapperStyle={
                          expanded
                            ? { gap: 16, alignItems: "stretch" }
                            : undefined
                        }
                        ItemSeparatorComponent={ListGap}
                        ListEmptyComponent={
                          <Notice title="Không có cấu hình khớp bộ lọc." />
                        }
                        renderItem={({ item }) => (
                          <View
                            style={{
                              width: expanded
                                ? Math.floor((gridWidth - 16) / 2)
                                : gridWidth,
                            }}
                          >
                            <PSREFListingCard
                              variant={item}
                              selected={compareIds.has(item.variantId)}
                              compareFull={compare.length >= 4}
                              onOpen={() => {
                                setHistorical(false);
                                setDetail(item);
                              }}
                              onCompare={() => select(item)}
                            />
                          </View>
                        )}
                      />
                    </View>
                    {filtered.length > catalogPageSize && (
                        <View style={s.row}>
                          <Button
                            label="Trang trước"
                            disabled={currentPage === 0}
                            onPress={() => changeCatalogPage(currentPage - 1)}
                          />
                          <Body>
                            {t("Trang")} {currentPage + 1}/{pageCount} ·{" "}
                            {filtered.length} {t("cấu hình")}
                          </Body>
                          <Button
                            label="Trang sau"
                            disabled={currentPage + 1 >= pageCount}
                            onPress={() => changeCatalogPage(currentPage + 1)}
                          />
                        </View>
                      )}
                  </View>
                )}

                {tab === "compare" && (
                  <ComparisonView
                    variants={compare}
                    onRemove={select}
                    onReplace={(v) => {
                      select(v);
                      switchTab("advisor");
                    }}
                    onAdd={() => openAdd(compare)}
                    onBrowse={() => switchTab("advisor")}
                  />
                )}

                <View style={{ display: tab === "carts" ? "flex" : "none" }}>
                  <CartsScreen
                    active={tab === "carts"}
                    priceTracking={priceTracking}
                    state={state}
                    mutate={mutate}
                    onCreate={() => setAddVariants([])}
                    onView={(v) => {
                      setHistorical(true);
                      setDetail(v);
                    }}
                    onCompare={(v) => {
                      setCompare(v.slice(0, 4));
                      switchTab("compare");
                    }}
                    onStartTracking={async (req) => {
                      const at = new Date().toISOString();
                      await mutate((x) => {
                        const existing = x.trackingRules.find(
                          (r) => r.candidateId === req.candidateId,
                        );
                        const nextRule = {
                          id: existing?.id ?? `track:${req.candidateId}`,
                          candidateId: req.candidateId,
                          status: "active" as const,
                          offerScope: existing?.offerScope ?? [],
                          targetAmount: req.targetAmount,
                          currency: "VND" as const,
                          notificationsEnabled: req.notificationsEnabled,
                          createdAt: existing?.createdAt ?? at,
                          updatedAt:
                            existing &&
                            Date.parse(at) < Date.parse(existing.createdAt)
                              ? existing.createdAt
                              : at,
                        };
                        return {
                          ...x,
                          trackingRules: existing
                            ? x.trackingRules.map((r) =>
                                r.id === existing.id ? nextRule : r,
                              )
                            : [...x.trackingRules, nextRule],
                        };
                      }, "Đã bắt đầu theo dõi giá.");
                    }}
                  />
                </View>

                {tab === "settings" && (
                  <SettingsScreen
                    preferences={state.preferences}
                    pending={pending}
                    configured={!!DEFAULT_API_ENDPOINT}
                    endpoint={DEFAULT_API_ENDPOINT}
                    onChange={prefs}
                    onCatalogRefresh={() => setCatalogRefresh((x) => x + 1)}
                    onExport={() => {
                      void shareOrDownloadJson(
                        "lua-backup.json",
                        JSON.stringify(state, null, 2),
                      ).then((outcome) => {
                        if (outcome === "downloaded")
                          setNotice("Đã tải xuống bản sao lưu JSON.");
                        else if (outcome === "copied")
                          setNotice("Đã sao chép bản sao lưu vào bộ nhớ tạm.");
                      });
                    }}
                    onDelete={() => setDeleteAll(true)}
                  />
                )}
              </ScrollView>

              {!rail && nav}
            </View>
          </View>

          <NeedsModal
            intake={intake}
            setIntake={setIntake}
            step={step}
            setStep={setStep}
            draft={draft}
            setDraft={setDraft}
            errors={errors}
            setErrors={setErrors}
            pending={pending}
            boot={boot}
            confirm={() => void confirm()}
          />
          <UnifiedFilterPanel
            visible={filterOpen}
            metadata={priceMetadata}
            value={filters}
            variants={catalog.variants}
            query={query}
            confirmed={state.confirmed}
            fitOrder={fitOrder}
            onApply={setFilters}
            onClose={() => setFilterOpen(false)}
          />
          <DeviceDetailModal
            variant={detail}
            variants={catalog.variants}
            explanationEndpoint={explanationEndpoint}
            historical={historical}
            selected={detail ? compareIds.has(detail.variantId) : false}
            compareFull={compare.length >= 4}
            profile={state.confirmed}
            revision={state.revision}
            offline={!!state.preferences.offlineAiOnly}
            onClose={() => setDetail(null)}
            onVariant={(v) => {
              setHistorical(false);
              setDetail(v);
            }}
            onCompare={select}
            onAdd={(v) => openAdd([v])}
          />
          <AddToCartModal
            catalogVersion={catalog.catalogVersion}
            visible={addVariants !== null}
            boot={boot}
            variants={addVariants ?? []}
            state={state}
            mutate={mutate}
            onClose={() => {
              setAddVariants(null);
            }}
          />
        </View>

        <View
          accessibilityViewIsModal={chatOpen}
          style={
            chatOpen
              ? {
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: c.background,
                }
              : { display: "none" }
          }
        >
          <ChatPanel
            transport={chatTransport}
            initialPrompt={initialPrompt}
            revision={state.revision}
            active={chatOpen}
            canCommit={boot === "ready" && !pending}
            onClose={() => setChatOpen(false)}
            onConfirm={async (proposal: ChatProposal) => {
              if (mutation.current) throw Error("BUSY");
              mutation.current = true;
              setPending(true);
              try {
                const next = await commitProposal(update, proposal);
                setNotice("Đã xác nhận nhu cầu.");
                setChatOpen(false);
                setResult(null);
                switchTab("advisor");
                void evaluate(next.confirmed, next.revision);
              } finally {
                mutation.current = false;
                setPending(false);
              }
            }}
          />
        </View>

        <Modal
          visible={deleteAll || reset}
          transparent
          onRequestClose={() => {
            if (!pending) {
              setDeleteAll(false);
              setReset(false);
            }
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 24,
              backgroundColor: "#00000066",
            }}
          >
            <View
              style={[
                s.card,
                {
                  backgroundColor: c.surface,
                  maxWidth: 480,
                  width: "100%",
                  alignSelf: "center",
                },
              ]}
            >
              <Title small>
                {reset ? "Xác nhận đặt lại dữ liệu" : "Xóa lịch sử giỏ hàng"}
              </Title>
              <Body>Dữ liệu không thể khôi phục sau khi xóa.</Body>
              <View style={s.row}>
                <Button
                  label="Hủy"
                  disabled={pending}
                  onPress={() => {
                    setDeleteAll(false);
                    setReset(false);
                  }}
                />
                <Button
                  label="Xác nhận xóa"
                  variant="destructive"
                  disabled={pending}
                  onPress={async () => {
                    if (mutation.current) return;
                    try {
                      if (reset) {
                        mutation.current = true;
                        setPending(true);
                        try {
                          await recover();
                        } finally {
                          mutation.current = false;
                          setPending(false);
                        }
                      } else {
                        await mutate(
                          (x) => ({
                            ...x,
                            legacyRaw: undefined,
                            saved: [],
                            cartData: emptyCarts,
                            offers: [],
                            observations: [],
                            trackingRules: [],
                            alertDeliveries: [],
                          }),
                          "Đã xóa giỏ hàng.",
                        );
                      }
                      setDeleteAll(false);
                      setReset(false);
                    } catch {
                      setNotice("Không lưu được. Dữ liệu cũ được giữ nguyên.");
                    }
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </CatalogProvider>
  );
}
