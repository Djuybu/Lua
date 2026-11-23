import { officialOffer, offerTotal } from "./domain/official";
import { destination } from "./domain/navigation";
import { probeCapabilities } from "./api/capabilities";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { House, Columns2, ShoppingCart, Settings } from "lucide-react-native";
import { AdvisorTheme, useTheme, type Preferences } from "./theme";
import { LocaleProvider, useLocale } from "./i18n";
import { Body, Button, Title, Notice, s } from "./ui";
import { createStore, empty, type State } from "./storage";
import {
  initialDraft,
  profileOf,
  draftErrors,
  categories,
  labels,
  vnd,
  outcome,
  type Draft,
} from "./model";
import type { ProductVariant, SnapshotManifest } from "./catalog";
import type { RecommendationResponseEnvelope } from "./envelope";
import seed from "./catalog.json";
import { loadCatalog, recommend, liveChatTransport } from "./api";
import { DEFAULT_API_ENDPOINT } from "./api/config";
import { recordError } from "./utils/error-logger";
import { ChatPanel } from "./ChatPanel";
import { commitProposal, type ChatTransport, type ChatProposal } from "./chat";
import {
  emptyFilters,
  filterVariants,
  countFilters,
  pricingMetadata,
  type Filters,
} from "./domain/filters";
import { PSREFListingCard } from "./components/PSREFListingCard";
import { FloatingSearchBar } from "./components/FloatingSearchBar";
import { UnifiedFilterPanel } from "./components/UnifiedFilterPanel";
import { AddToCartModal } from "./components/AddToCartModal";
import { NeedsModal } from "./screens/NeedsModal";
import { DeviceDetailModal } from "./screens/DeviceDetailModal";
import { CartsScreen } from "./screens/CartsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ComparisonView } from "./ComparisonView";
import { CatalogProvider } from "./catalog-context";
const bundledCatalog = seed as SnapshotManifest;
const store = createStore(AsyncStorage);
const destinations = [
  { id: "advisor", label: "Trang chủ", icon: House },
  { id: "compare", label: "So sánh", icon: Columns2 },
  { id: "carts", label: "Giỏ hàng", icon: ShoppingCart },
  { id: "settings", label: "Cài đặt", icon: Settings },
] as const;
type Tab = (typeof destinations)[number]["id"];
export default function AdviserApp({
  chatTransport = liveChatTransport,
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
  const { t } = useLocale();
  const { width, height } = useWindowDimensions();
  const rail = width >= 840 || (width >= 600 && height >= 600);
  const expanded = width >= 840;
  const [catalog, setCatalog] = useState<SnapshotManifest>(bundledCatalog);
  const [catalogStatus, setCatalogStatus] = useState<
    "loading" | "live" | "bundled"
  >("loading");
  useEffect(() => {
    if (!DEFAULT_API_ENDPOINT) {
      setCatalogStatus("bundled");
      return;
    }
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
  }, []);
  const [priceTracking, setPriceTracking] = useState(false);
  useEffect(() => {
    setPriceTracking(false);
    if (!DEFAULT_API_ENDPOINT || state.preferences.offlineAiOnly) return;
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
  }, [state.preferences.offlineAiOnly]);
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
  const [result, setResult] = useState<RecommendationResponseEnvelope | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState("");
  const ticket = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const mutation = useRef(false);
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
  async function mutate(fn: (s: State) => State, ack: string) {
    if (mutation.current) throw Error("BUSY");
    mutation.current = true;
    setPending(true);
    try {
      const next = await update(fn);
      setNotice(ack);
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
    setResult(null);
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
      setTab("advisor");
      void evaluate(p, next.revision);
    } catch {
      setErrors(["Không thể lưu nhu cầu. Bản nháp vẫn được giữ."]);
    }
  }
  function select(v: ProductVariant) {
    setCompare((xs) =>
      xs.some((x) => x.variantId === v.variantId)
        ? xs.filter((x) => x.variantId !== v.variantId)
        : xs.length < 4
          ? [...xs, v]
          : xs,
    );
  }
  function openAdd(v: ProductVariant[]) {
    setDetail(null);
    setAddVariants(v);
  }
  const priceMetadata = useMemo(() => ({
    ...Object.fromEntries(
      catalog.variants.flatMap((v) => {
        const o = officialOffer(catalog, v.variantId);
        return o
          ? [
              [
                v.variantId,
                {
                  price: o.basePriceVnd,
                  total: offerTotal(o),
                  condition: o.condition === "NEW" ? "new" : "used",
                },
              ],
            ]
          : [];
      }),
    ),
    ...pricingMetadata(state.offers, state.observations),
  }), [catalog, state.offers, state.observations]);
  const filtered = useMemo(() => filterVariants(
    catalog.variants,
    filters,
    deferredQuery,
    priceMetadata,
  ).filter(
    (v) =>
      filters.showExcluded ||
      !state.confirmed ||
      (v.category === state.confirmed.category &&
        (!state.confirmed.hardConstraints?.minRamGb ||
          v.specifications.ramGb >= state.confirmed.hardConstraints.minRamGb)),
  ), [catalog.variants, filters, deferredQuery, priceMetadata, state.confirmed]);
  useEffect(() => { setCatalogPage(0); }, [filters, deferredQuery, catalog.catalogVersion]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / catalogPageSize));
  const currentPage = Math.min(catalogPage, pageCount - 1);
  const pageVariants = filtered.slice(currentPage * catalogPageSize, (currentPage + 1) * catalogPageSize);
  function changeCatalogPage(page: number) {
    setCatalogPage(page);
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }
  const nav = (
    <View
      style={{
        flexDirection: rail ? "column" : "row",
        padding: 8,
        gap: rail ? 12 : 0,
        backgroundColor: c.surfaceContainer,
        justifyContent: "space-around",
      }}
    >
      {destinations.map(({ id, label, icon: Icon }) => (
        <View key={id} style={{ flex: rail ? undefined : 1 }}>
          <Button
            label={rail ? label : ""}
            a11yLabel={t(label)}
            selected={tab === id}
            quiet={tab !== id}
            onPress={() => {
              setTab(id);
              setNotice("");
            }}
            icon={
              <Icon
                size={22}
                color={tab === id ? c.onPrimary : c.onSurfaceVariant}
              />
            }
          />
          {!rail && (
            <Text
              style={{
                textAlign: "center",
                color: c.onSurface,
                fontSize: 11,
                marginTop: 4,
              }}
            >
              {t(label)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
  return (
    <CatalogProvider manifest={catalog}>
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View
        style={{
          paddingHorizontal: 24,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 30, fontWeight: "800", color: c.onSurface }}
        >
          Lựa<Text style={{ color: c.primary }}>.</Text>
        </Text>
        <Body muted>Chọn có căn cứ</Body>
        <Button quiet label="Nhu cầu" onPress={openNeeds} />
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {rail && nav}
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={contentScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 32,
              maxWidth: 1120,
              width: "100%",
              alignSelf: "center",
            }}
          >
            {boot === "loading" && <ActivityIndicator color={c.primary} />}
            {boot === "failed" && (
              <Notice title="Cần khôi phục dữ liệu">
                <Button
                  label="Xuất bản gốc"
                  onPress={async () =>
                    void Share.share({
                      message: (await store.exportRaw()) ?? "",
                    })
                  }
                />
                <Button
                  label="Xác nhận đặt lại dữ liệu"
                  onPress={() => setReset(true)}
                />
              </Notice>
            )}
            {!!notice && <Notice title={notice} />}
            {catalogStatus === "loading" && (
              <Notice title="Đang tải catalog từ PostgreSQL/Qdrant…" />
            )}
            {catalogStatus === "bundled" && (
              <Notice title="Đang dùng catalog đóng gói">
                Mobile không kết nối được backend nên đang dùng snapshot {catalog.catalogVersion} gồm {catalog.variants.length} cấu hình. Giá và thời điểm quan sát có thể không còn mới.
              </Notice>
            )}
            {catalogStatus === "live" && (
              <Body muted>
                Catalog live · {catalog.variants.length} cấu hình · {catalog.catalogVersion}
              </Body>
            )}
            {tab === "advisor" && (
              <View style={s.section}>
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
                      onPress={() => setFilters(structuredClone(emptyFilters))}
                    />
                  )}
                </View>
                {state.confirmed && (
                  <Notice
                    title={
                      t(categories[state.confirmed.category]) +
                      " · " +
                      vnd(state.confirmed.budget.hardCeilingVnd)
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
                {!!networkError && <Notice title={networkError} />}
                {result && <Notice title={outcome(result)} />}
                {result?.shortlist.map((candidate) => (
                  <Notice key={candidate.variantId} title={candidate.modelName}>
                    <Body>{vnd(candidate.totalVnd)}</Body>
                    <Body muted>
                      {candidate.bestOffer?.sourceId}{" "}
                      {candidate.bestOffer?.observedAt}
                    </Body>
                  </Notice>
                ))}
                <View
                  onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
                >
                  <FlatList
                    key={expanded ? "two" : "one"}
                    data={catalogStatus !== "loading" ? pageVariants : []}
                    numColumns={expanded ? 2 : 1}
                    scrollEnabled={false}
                    keyExtractor={(v) => v.variantId}
                    columnWrapperStyle={
                      expanded ? { gap: 16, alignItems: "stretch" } : undefined
                    }
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 16 }} />
                    )}
                    ListEmptyComponent={
                      <View>{catalogStatus !== "loading" && <Notice title="Không có cấu hình khớp bộ lọc." />}</View>
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
                          selected={compare.some(
                            (x) => x.variantId === item.variantId,
                          )}
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
                {catalogStatus !== "loading" && filtered.length > catalogPageSize && (
                  <View style={s.row}>
                    <Button label="Trang trước" disabled={currentPage === 0} onPress={() => changeCatalogPage(currentPage - 1)} />
                    <Body>Trang {currentPage + 1}/{pageCount} · {filtered.length} cấu hình</Body>
                    <Button label="Trang sau" disabled={currentPage + 1 >= pageCount} onPress={() => changeCatalogPage(currentPage + 1)} />
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
                  setTab("advisor");
                }}
                onAdd={() => openAdd(compare)}
              />
            )}
            <View style={{ display: tab === "carts" ? "flex" : "none" }}>
              <CartsScreen
                priceTracking={priceTracking}
                state={state}
                update={update}
                onCreate={() => setAddVariants([])}
                onView={(v) => {
                  setHistorical(true);
                  setDetail(v);
                }}
                onCompare={(v) => {
                  setCompare(v);
                  setTab("compare");
                }}
              />
            </View>
            {tab === "settings" && (
              <SettingsScreen
                preferences={state.preferences}
                pending={pending}
                configured={!!DEFAULT_API_ENDPOINT}
                onChange={prefs}
                onExport={() =>
                  void Share.share({ message: JSON.stringify(state, null, 2) })
                }
                onDelete={() => setDeleteAll(true)}
              />
            )}
          </ScrollView>
          <FloatingSearchBar
            query={query}
            count={countFilters(filters)}
            onQuery={(q) => {
              setQuery(q);
              setTab("advisor");
            }}
            onFilters={() => setFilterOpen(true)}
            onAdvisor={openNeeds}
            onAi={() => {
              setInitialPrompt(query);
              setChatOpen(true);
            }}
          />
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
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />
      <DeviceDetailModal
        variant={detail}
        variants={catalog.variants}
        explanationEndpoint={explanationEndpoint}
        historical={historical}
        profile={state.confirmed}
        revision={state.revision}
        offline={!!state.preferences.offlineAiOnly}
        onClose={() => setDetail(null)}
        onVariant={setDetail}
        onCompare={select}
        onAdd={(v) => openAdd([v])}
      />
      <AddToCartModal
        catalogVersion={catalog.catalogVersion}
        visible={addVariants !== null}
        variants={addVariants ?? []}
        state={state}
        update={update}
        onSaved={() => setNotice("Đã thêm vào giỏ.")}
        onClose={() => {
          setAddVariants(null);
        }}
      />
      <View
        accessibilityElementsHidden={!chatOpen}
        style={
          chatOpen
            ? {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: c.background,
                paddingTop: 24,
              }
            : { display: "none" }
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            gap: 16,
            maxWidth: 800,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Button label="Đóng" onPress={() => setChatOpen(false)} />
          <ChatPanel
            transport={chatTransport}
            initialPrompt={initialPrompt}
            revision={state.revision}
            active={chatOpen}
            canCommit={boot === "ready" && !pending}
            onConfirm={async (proposal: ChatProposal) => {
              const next = await commitProposal(update, proposal);
              setNotice("Đã xác nhận nhu cầu.");
              void evaluate(next.confirmed, next.revision);
            }}
          />
        </ScrollView>
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
          <View style={[s.card, { backgroundColor: c.surface }]}>
            <Title small>
              {reset ? "Xác nhận đặt lại dữ liệu" : "Xóa lịch sử giỏ hàng"}
            </Title>
            <Body>Dữ liệu không thể khôi phục sau khi xóa.</Body>
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
              disabled={pending}
              onPress={async () => {
                try {
                  if (reset) await recover();
                  else
                    await mutate(
                      (x) => ({
                        ...x,
                        legacyRaw: undefined,
                        saved: [],
                        cartData: { carts: [], candidates: [], legacyMap: {} },
                        trackingRules: [],
                        alertDeliveries: [],
                      }),
                      "Đã xóa giỏ hàng.",
                    );
                  setDeleteAll(false);
                  setReset(false);
                } catch {
                  setNotice("Không lưu được. Dữ liệu cũ được giữ nguyên.");
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </CatalogProvider>
  );
}
