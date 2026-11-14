import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Compass,
  SlidersHorizontal,
  Columns2,
  Bookmark,
  Settings,
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  Check,
  X,
  Search,
  ArrowLeft,
  ArrowRight,
  Info,
  Palette,
  Sparkles,
} from "lucide-react-native";
import { AdvisorTheme, useTheme, type Preferences } from "./theme";
import { Body, Button, Notice, Title, s } from "./ui";
import {
  categories,
  outcome,
  labels,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
  initialDraft,
  changeCategory,
  toggleOrdered,
  draftErrors,
  profileOf,
  vnd,
  safeEndpoint,
  type Draft,
  type DeviceCategory,
} from "./model";
import { createStore, empty, type State, type Saved } from "./storage";
import type { ProductVariant, SnapshotManifest } from "./catalog";
import type { RecommendationResponseEnvelope } from "./envelope";
import seed from "./catalog.json";
import provenance from "./provenance.json";
import { recommend } from "./api";
const catalog = seed as SnapshotManifest;
const store = createStore(AsyncStorage);
const tabs = [
  { name: "Tư vấn", icon: Sparkles },
  { name: "Khám phá", icon: Compass },
  { name: "So sánh", icon: Columns2 },
  { name: "Đã lưu", icon: Bookmark },
  { name: "Cài đặt", icon: Settings },
];
const categoryIcons = {
  phone: Smartphone,
  tablet: Tablet,
  pc_laptop: Laptop,
  pc_desktop: Monitor,
};
const steps = [
  "Thiết bị",
  "Mục đích",
  "Ngân sách",
  "Ưu tiên",
  "Làm rõ",
  "Xem lại",
];
export default function App() {
  const [state, setState] = useState<State>(empty);
  const [boot, setBoot] = useState<"loading" | "ready" | "failed">("loading");
  const [issue, setIssue] = useState("");
  useEffect(() => {
    store
      .load()
      .then((x) => {
        setState(x);
        setBoot("ready");
      })
      .catch(() => {
        setIssue(
          "Không đọc được dữ liệu đã lưu. Bản gốc được giữ nguyên; thao tác ghi đang khóa.",
        );
        setBoot("failed");
      });
  }, []);
  async function update(fn: (x: State) => State) {
    const next = await store.update(fn);
    setState(next);
    return next;
  }
  return (
    <SafeAreaProvider>
      <AdvisorTheme preferences={state.preferences}>
        <Workspace
          state={state}
          boot={boot}
          issue={issue}
          update={update}
          recover={async () => {
            setState(await store.recover());
            setBoot("ready");
            setIssue("");
          }}
        />
      </AdvisorTheme>
    </SafeAreaProvider>
  );
}
function Workspace({
  state,
  boot,
  issue,
  update,
  recover,
}: {
  state: State;
  boot: string;
  issue: string;
  update: (fn: (x: State) => State) => Promise<State>;
  recover: () => Promise<void>;
}) {
  const { c, isDark, fallback } = useTheme();
  const { width } = useWindowDimensions();
  const expanded = width >= 840;
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DeviceCategory | null>(null);
  const [detail, setDetail] = useState<ProductVariant | null>(null);
  const [historical, setHistorical] = useState<Saved | null>(null);
  const [compare, setCompare] = useState<ProductVariant[]>([]);
  const [intake, setIntake] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationResponseEnvelope | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [networkError, setNetworkError] = useState("");
  const ticket = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const [endpoint, setEndpoint] = useState(state.preferences.endpoint);
  const [customSeed, setCustomSeed] = useState(state.preferences.seed);
  useEffect(() => {
    setEndpoint(state.preferences.endpoint);
    setCustomSeed(state.preferences.seed);
  }, [state.preferences]);
  useEffect(
    () => () => {
      abort.current?.abort();
      ticket.current++;
    },
    [],
  );
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (intake) {
        if (step > 0) setStep(step - 1);
        else setIntake(false);
        return true;
      }
      if (detail) {
        setDetail(null);
        return true;
      }
      if (tab !== 0) {
        setTab(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [intake, step, detail, tab]);
  const input = {
    ...s.input,
    color: c.onSurface,
    borderColor: c.outline,
    backgroundColor: c.surface,
  };
  async function mutate(fn: (x: State) => State, ack: string) {
    if (mutation.current) return;
    mutation.current = true;
    setPending(true);
    try {
      await update(fn);
      setNotice(ack);
    } catch {
      setNotice("Không lưu được. Dữ liệu cũ được giữ nguyên; hãy thử lại.");
      throw new Error("write failed");
    } finally {
      setPending(false);
      mutation.current = false;
    }
  }
  async function evaluate(
    profile = state.confirmed,
    revision = state.revision,
  ) {
    abort.current?.abort();
    const id = ++ticket.current;
    setResult(null);
    setNetworkError("");
    if (!profile || !state.preferences.endpoint) return;
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const data = await recommend(
        state.preferences.endpoint,
        profile,
        revision,
        String(id),
        controller.signal,
      );
      if (id === ticket.current) setResult(data);
    } catch (e) {
      if (id === ticket.current)
        setNetworkError(
          controller.signal.aborted
            ? "Yêu cầu đã hủy hoặc hết thời gian. Bạn có thể thử lại."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timeout);
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
    setStep(0);
    setErrors([]);
    setNotice("");
    setIntake(true);
  }
  async function confirm() {
    const es = draftErrors(draft);
    if (es.length) {
      setErrors([
        "Chọn đúng ba mục đích, ba ưu tiên; nhập trần ngân sách và RAM hợp lệ.",
      ]);
      return;
    }
    if (mutation.current) return;
    const p = profileOf(draft);
    const rev = state.revision + 1;
    try {
      await mutate(
        (x) => ({ ...x, confirmed: p, revision: rev }),
        "Đã xác nhận nhu cầu.",
      );
      setIntake(false);
      setTab(0);
      setHistorical(null);
      evaluate(p, rev);
    } catch {
      setErrors(["Không thể lưu nhu cầu. Bản nháp vẫn còn; hãy thử lại."]);
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
    if (
      compare.length === 4 &&
      !compare.some((x) => x.variantId === v.variantId)
    )
      setNotice(
        "Bạn có thể so sánh tối đa bốn thiết bị. Hãy bỏ một máy để thay thế.",
      );
  }
  async function save(variants: ProductVariant[]) {
    if (!state.confirmed) {
      setNotice("Xác nhận nhu cầu trước khi lưu quyết định.");
      return;
    }
    try {
      await mutate(
        (x) => ({
          ...x,
          saved: [
            {
              id: Date.now().toString(),
              at: new Date().toISOString(),
              variants: structuredClone(variants),
              profile: x.confirmed,
              catalogVersion: catalog.catalogVersion,
            },
            ...x.saved,
          ],
        }),
        "Đã lưu quyết định trên thiết bị.",
      );
    } catch {}
  }
  const filtered = catalog.variants.filter(
    (v) =>
      (!category || v.category === category) &&
      `${v.modelName} ${v.brand} ${v.specifications.ramGb}GB ${v.specifications.storageGb}GB`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const nav = (
    <View
      style={{
        flexDirection: expanded ? "column" : "row",
        gap: expanded ? 12 : 0,
        padding: expanded ? 16 : 6,
        backgroundColor: c.surfaceContainer,
        justifyContent: "space-around",
      }}
    >
      {tabs.map(({ name, icon: Icon }, i) => (
        <View key={name} style={{ flex: expanded ? undefined : 1 }}>
          <Button
            quiet={!(tab === i)}
            selected={tab === i}
            label={expanded ? name : ""}
            a11yLabel={name}
            icon={
              <Icon
                size={22}
                color={tab === i ? c.onPrimary : c.onSurfaceVariant}
              />
            }
            onPress={() => {
              setTab(i);
              setNotice("");
            }}
          />
          <Text
            accessibilityRole="text"
            style={{
              textAlign: "center",
              color: c.onSurface,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            {expanded
              ? ""
              : name +
                (i === 2 && compare.length ? ` (${compare.length})` : "")}
          </Text>
        </View>
      ))}
    </View>
  );
  function DeviceCard({ v }: { v: ProductVariant }) {
    const Icon = categoryIcons[v.category];
    const selected = compare.some((x) => x.variantId === v.variantId);
    return (
      <View
        style={[
          s.card,
          {
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.outline,
            flex: 1,
            margin: 6,
          },
        ]}
      >
        <View style={s.row}>
          <View
            style={{
              backgroundColor: c.primaryContainer,
              padding: 12,
              borderRadius: 16,
            }}
          >
            <Icon color={c.onPrimaryContainer} size={26} />
          </View>
          <Body muted>
            {categories[v.category]} · {v.brand}
          </Body>
        </View>
        <Text
          style={{
            fontSize: 21,
            lineHeight: 28,
            fontWeight: "600",
            color: c.onSurface,
          }}
        >
          {v.modelName}
        </Text>
        <View style={s.row}>
          {[
            ["RAM", v.specifications.ramGb + " GB"],
            ["Lưu trữ", v.specifications.storageGb + " GB"],
            ["CPU", v.specifications.cpu],
            ["Hệ điều hành", v.specifications.os],
          ].map(([k, value]) => (
            <View key={k} style={s.spec}>
              <Body muted>{k}</Body>
              <Body>{value}</Body>
            </View>
          ))}
        </View>
        <Body muted>Chưa có giá trọn gói đã xác minh</Body>
        <View style={s.row}>
          <Button
            label="Xem chi tiết"
            onPress={() => {
              setHistorical(null);
              setDetail(v);
            }}
          />
          <Button
            label={selected ? "Đã chọn" : "So sánh"}
            selected={selected}
            onPress={() => select(v)}
          />
        </View>
      </View>
    );
  }
  function SettingsScreen() {
    async function prefs(p: Partial<Preferences>) {
      try {
        await mutate(
          (x) => ({ ...x, preferences: { ...x.preferences, ...p } }),
          "Đã lưu tùy chọn.",
        );
      } catch {}
    }
    return (
      <View style={s.section}>
        <Title>Không gian của bạn</Title>
        <Body muted>Màu sắc và giao diện theo cách bạn muốn.</Body>
        <Title small>Giao diện</Title>
        <View style={s.row}>
          {(["system", "light", "dark"] as const).map((x, i) => (
            <Button
              key={x}
              selected={state.preferences.appearance === x}
              label={["Theo thiết bị", "Sáng", "Tối"][i]}
              onPress={() => prefs({ appearance: x })}
            />
          ))}
        </View>
        <Title small>Bảng màu Material You</Title>
        <Button
          label="Dùng màu của thiết bị"
          selected={state.preferences.dynamic}
          onPress={() => prefs({ dynamic: !state.preferences.dynamic })}
        />
        <Body muted>
          Android 12 trở lên lấy màu hệ thống trong bản cài native. Thiết bị
          khác dùng màu dự phòng bạn chọn.
        </Body>
        <View style={s.row}>
          {[
            "#6750A4",
            "#0061A4",
            "#984061",
            "#825500",
            "#006A67",
            "#545E71",
          ].map((color) => (
            <Button
              key={color}
              label={color}
              selected={
                !state.preferences.dynamic && state.preferences.seed === color
              }
              icon={<Palette size={18} color={c.primary} />}
              onPress={() => prefs({ seed: color, dynamic: false })}
            />
          ))}
        </View>
        <TextInput
          accessibilityLabel="Mã màu tùy chỉnh"
          value={customSeed}
          onChangeText={setCustomSeed}
          maxLength={7}
          autoCapitalize="none"
          style={input}
        />
        <Button
          label="Áp dụng màu tùy chỉnh"
          disabled={!/^#[0-9a-f]{6}$/i.test(customSeed) || pending}
          onPress={() => prefs({ seed: customSeed, dynamic: false })}
        />
        {fallback && (
          <Notice title="Đã dùng bảng màu dự phòng">
            Bảng màu hiện tại chưa đạt độ tương phản cần thiết.
          </Notice>
        )}
        <Title small>Kết nối tư vấn</Title>
        <TextInput
          accessibilityLabel="Địa chỉ máy chủ"
          placeholder="https://… hoặc http://10.0.2.2:8787"
          placeholderTextColor={c.onSurfaceVariant}
          value={endpoint}
          onChangeText={setEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
          style={input}
        />
        <Button
          label="Lưu kết nối"
          disabled={(!!endpoint && !safeEndpoint(endpoint)) || pending}
          onPress={() => {
            abort.current?.abort();
            ticket.current++;
            setResult(null);
            setLoading(false);
            prefs({ endpoint });
          }}
        />
        <Body muted>
          Để trống để xem catalog đã lưu. Không có API key nào được lưu trong
          ứng dụng.
        </Body>
        <Title small>Dữ liệu trên thiết bị</Title>
        <Body>
          Quyết định và tùy chọn chỉ lưu trên thiết bị này. Dữ liệu tham khảo
          không phải chào bán đã được duyệt.
        </Body>
        <Button
          label="Xuất dữ liệu cá nhân"
          onPress={() =>
            Share.share({ message: JSON.stringify(state, null, 2) })
          }
        />
        <Button label="Xóa lịch sử đã lưu" onPress={() => setDeleteId("all")} />
      </View>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View
        style={{
          paddingHorizontal: 24,
          paddingVertical: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 30,
            fontWeight: "800",
            letterSpacing: -1,
            color: c.onSurface,
          }}
        >
          Lựa<Text style={{ color: c.primary }}>.</Text>
        </Text>
        <View style={s.row}>
          <Body muted>Chọn có căn cứ</Body>
          <Button
            quiet
            label="Nhu cầu"
            icon={<SlidersHorizontal color={c.primary} size={20} />}
            onPress={openNeeds}
          />
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: expanded ? "row" : "column" }}>
        {expanded && nav}
        <View style={{ flex: 1 }}>
          {boot === "loading" ? (
            <ActivityIndicator
              accessibilityLabel="Đang khôi phục dữ liệu"
              color={c.primary}
            />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: expanded ? 32 : 20,
                paddingBottom: 40,
                maxWidth: 1280,
                width: "100%",
                alignSelf: "center",
              }}
            >
              {boot === "failed" && (
                <Notice title="Cần khôi phục dữ liệu">
                  {issue}
                  <View style={s.row}>
                    <Button
                      label="Xuất bản gốc"
                      onPress={async () =>
                        Share.share({
                          message: (await store.exportRaw()) ?? "",
                        })
                      }
                    />
                    <Button
                      label="Xác nhận đặt lại dữ liệu"
                      onPress={() => setDeleteId("recover")}
                    />
                  </View>
                </Notice>
              )}
              {notice !== "" && (
                <View style={{ marginBottom: 16 }}>
                  <Notice title={notice} />
                </View>
              )}
              {tab === 0 && (
                <View style={s.section}>
                  <Title>Thiết bị phù hợp, từ nhu cầu của bạn.</Title>
                  <Body muted>
                    Bắt đầu bằng điều bạn cần. Kiểm tra thông số, nguồn dữ liệu
                    và những gì còn chưa rõ trước khi chọn.
                  </Body>
                  <View style={s.row}>
                    <Button
                      label={
                        state.confirmed
                          ? "Điều chỉnh nhu cầu"
                          : "Tìm thiết bị cho tôi"
                      }
                      selected
                      onPress={openNeeds}
                      icon={<ArrowRight size={20} color={c.onPrimary} />}
                    />
                    <Button
                      quiet
                      label="Khám phá trước"
                      onPress={() => setTab(1)}
                    />
                  </View>
                  {state.confirmed && (
                    <Notice
                      title={`${categories[state.confirmed.category]} · trần ${vnd(state.confirmed.budget.hardCeilingVnd)}`}
                    >
                      <Body>
                        {state.confirmed.orderedPurposes
                          .map((x) => labels[x])
                          .join(" · ")}
                      </Body>
                      <Body muted>
                        Ưu tiên:{" "}
                        {state.confirmed.orderedPriorities
                          .map((x) => labels[x])
                          .join(", ")}
                      </Body>
                    </Notice>
                  )}
                  {state.confirmed && (
                    <View style={s.row}>
                      <Button
                        label="Cập nhật kết quả"
                        disabled={loading || !state.preferences.endpoint}
                        onPress={() => evaluate()}
                      />
                      {loading && (
                        <Button
                          label="Hủy tải"
                          onPress={() => {
                            abort.current?.abort();
                            ticket.current++;
                            setLoading(false);
                            setNetworkError(
                              "Đã hủy tải; nhu cầu vẫn được giữ.",
                            );
                          }}
                        />
                      )}
                    </View>
                  )}
                  {loading && (
                    <ActivityIndicator
                      accessibilityLabel="Đang tải kết quả"
                      color={c.primary}
                    />
                  )}{" "}
                  {networkError && (
                    <Notice title="Không tải được kết quả">
                      {networkError}
                    </Notice>
                  )}
                  {result && (
                    <Notice title={outcome(result)}>
                      {result.shortlist.length
                        ? "Thông tin giá và độ phù hợp cần được kiểm tra theo nguồn."
                        : "Chưa thể kết luận thiết bị không phù hợp chỉ vì thiếu chào bán."}
                    </Notice>
                  )}
                  {result?.shortlist.map((r) => (
                    <Notice key={r.variantId} title={r.modelName}>
                      <Body>
                        {r.totalVnd === null
                          ? "Tổng giá chưa xác định"
                          : `Tổng theo dịch vụ: ${vnd(r.totalVnd)}`}
                      </Body>
                      <Body muted>
                        {r.factIds.length
                          ? "Có tham chiếu dữ liệu; cần kiểm tra nội dung."
                          : "Chưa có bằng chứng hiệu năng độc lập."}
                      </Body>
                    </Notice>
                  ))}
                  <Notice title="Dữ liệu tham khảo, không phải chào bán">
                    4 cấu hình từ nguồn bán lẻ; chưa có phí trọn gói hoặc bằng
                    chứng hiệu năng được duyệt. Bạn vẫn có thể xem chi tiết và
                    so sánh thông số.
                  </Notice>
                  <Title small>Khám phá từ thông số</Title>
                  <View style={s.row}>
                    {Object.entries(categories).map(([id, label]) => (
                      <Button
                        key={id}
                        label={label}
                        onPress={() => {
                          setCategory(id as DeviceCategory);
                          setTab(1);
                        }}
                      />
                    ))}
                  </View>
                </View>
              )}
              {tab === 1 && (
                <View style={s.section}>
                  <Title>Khám phá thiết bị</Title>
                  <Body muted>
                    Thông số rõ ràng. Những điều chưa biết cũng rõ ràng.
                  </Body>
                  <TextInput
                    accessibilityLabel="Tìm theo tên, RAM hoặc dung lượng"
                    placeholder="Tên thiết bị, RAM, dung lượng…"
                    placeholderTextColor={c.onSurfaceVariant}
                    value={query}
                    onChangeText={setQuery}
                    style={input}
                  />
                  <View style={s.row}>
                    <Button
                      label="Tất cả"
                      selected={!category}
                      onPress={() => setCategory(null)}
                    />
                    {Object.entries(categories).map(([id, label]) => (
                      <Button
                        key={id}
                        label={label}
                        selected={category === id}
                        onPress={() => setCategory(id as DeviceCategory)}
                      />
                    ))}
                  </View>
                  <Body muted>
                    {filtered.length} cấu hình tham khảo · quan sát 14/11/2026
                  </Body>
                  {!filtered.length && (
                    <Notice title="Chưa có cấu hình trong bộ lọc này">
                      Không có kết quả không có nghĩa là thị trường không có
                      thiết bị phù hợp.
                      <Button
                        label="Xóa bộ lọc"
                        onPress={() => {
                          setQuery("");
                          setCategory(null);
                        }}
                      />
                    </Notice>
                  )}
                  <FlatList
                    key={expanded ? "wide" : "compact"}
                    data={filtered}
                    scrollEnabled={false}
                    numColumns={expanded ? 2 : 1}
                    keyExtractor={(v) => v.variantId}
                    renderItem={({ item }) => <DeviceCard v={item} />}
                  />
                </View>
              )}
              {tab === 2 && (
                <View style={s.section}>
                  <Title>Đặt cạnh nhau, thấy rõ hơn.</Title>
                  <Body muted>
                    Chọn tối đa 4 thiết bị. Thông số khác nhau không tự xác định
                    máy tốt hơn.
                  </Body>
                  {compare.length < 2 && (
                    <Notice title={`Đã chọn ${compare.length}/4 thiết bị`}>
                      <Button
                        label="Chọn thêm thiết bị"
                        onPress={() => setTab(1)}
                      />
                    </Notice>
                  )}
                  {compare.length > 0 && (
                    <ScrollView horizontal>
                      <View>
                        {[
                          "Thiết bị",
                          "RAM",
                          "Lưu trữ",
                          "CPU",
                          "Hệ điều hành",
                          "Tổng chi phí",
                          "Bằng chứng hiệu năng",
                        ].map((field, i) => (
                          <View
                            key={field}
                            style={{
                              flexDirection: "row",
                              backgroundColor:
                                i % 2 ? c.surfaceContainer : c.surface,
                              padding: 12,
                            }}
                          >
                            <Text
                              style={{
                                width: 108,
                                color: c.onSurface,
                                fontWeight: "600",
                              }}
                            >
                              {field}
                            </Text>
                            {compare.map((v) => (
                              <View
                                key={v.variantId}
                                style={{
                                  width: expanded ? 230 : 188,
                                  paddingHorizontal: 12,
                                  gap: 8,
                                }}
                              >
                                <Text
                                  accessibilityLabel={`${v.modelName}, ${field}`}
                                  style={{
                                    color: c.onSurface,
                                    fontSize: 15,
                                    lineHeight: 23,
                                  }}
                                >
                                  {
                                    [
                                      v.modelName,
                                      v.specifications.ramGb + " GB",
                                      v.specifications.storageGb + " GB",
                                      v.specifications.cpu,
                                      v.specifications.os,
                                      "Chưa xác định",
                                      "Chưa có đo kiểm độc lập",
                                    ][i]
                                  }
                                </Text>
                                {i === 0 && (
                                  <>
                                    <Button
                                      label="Bỏ chọn"
                                      quiet
                                      onPress={() => select(v)}
                                    />
                                    <Button
                                      label="Đổi máy"
                                      quiet
                                      onPress={() => {
                                        select(v);
                                        setTab(1);
                                      }}
                                    />
                                  </>
                                )}
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  {compare.length > 0 && (
                    <Button
                      label="Lưu bảng so sánh"
                      disabled={pending || boot !== "ready"}
                      onPress={() => save(compare)}
                    />
                  )}
                </View>
              )}
              {tab === 3 && (
                <View style={s.section}>
                  <Title>Quyết định đã lưu</Title>
                  <Body muted>
                    Giữ lại lý do chọn và bối cảnh tại thời điểm lưu.
                  </Body>
                  {!state.saved.length && (
                    <Notice title="Chưa có quyết định nào">
                      <Button
                        label="Khám phá thiết bị"
                        onPress={() => setTab(1)}
                      />
                    </Notice>
                  )}
                  {state.saved.map((x) => (
                    <View
                      key={x.id}
                      style={[s.card, { backgroundColor: c.surfaceContainer }]}
                    >
                      <Title small>
                        {x.variants.map((v) => v.brand).join(" / ")}
                      </Title>
                      <Body muted>
                        {new Date(x.at).toLocaleString("vi-VN")} · Bản lưu lịch
                        sử
                      </Body>
                      {x.variants.map((v) => (
                        <Button
                          key={v.variantId}
                          label={v.modelName}
                          onPress={() => {
                            setHistorical(x);
                            setDetail(v);
                          }}
                        />
                      ))}
                      <View style={s.row}>
                        <Button
                          label="Chia sẻ"
                          onPress={() =>
                            Share.share({
                              message: `Lựa — bản lưu ${x.at}\n${x.variants.map((v) => v.modelName).join("\n")}\nTổng chi phí và độ phù hợp chưa xác minh.`,
                            })
                          }
                        />
                        <Button
                          quiet
                          label="Xóa bản lưu"
                          onPress={() => setDeleteId(x.id)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {tab === 4 && SettingsScreen()}
            </ScrollView>
          )}
        </View>
        {!expanded && nav}
      </View>
      <Modal
        visible={intake}
        animationType="none"
        onRequestClose={() => {
          if (step) setStep(step - 1);
          else setIntake(false);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: 24,
                gap: 22,
                maxWidth: 720,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <View style={{ ...s.row, justifyContent: "space-between" }}>
                <Body muted>Bước {step + 1} / 6</Body>
                <Button quiet label="Hủy" onPress={() => setIntake(false)} />
              </View>
              <Title>{steps[step]}</Title>
              <Body muted>
                Chỉ thay đổi nhu cầu đang dùng sau khi bạn xác nhận.
              </Body>
              {errors.map((e, i) => (
                <Text
                  key={i}
                  accessibilityRole="alert"
                  style={{ color: c.error, fontSize: 16 }}
                >
                  {e}
                </Text>
              ))}
              {step === 0 && (
                <View style={s.section}>
                  {Object.entries(categories).map(([id, label]) => (
                    <Button
                      key={id}
                      label={label}
                      selected={draft.category === id}
                      onPress={() =>
                        setDraft(changeCategory(draft, id as DeviceCategory))
                      }
                    />
                  ))}
                </View>
              )}
              {step === 1 && (
                <>
                  <Body>
                    Chọn đúng 3 mục đích theo thứ tự quan trọng. Bỏ chọn rồi
                    chọn lại để đổi thứ tự.
                  </Body>
                  {CATEGORY_PURPOSES[draft.category].map((id) => (
                    <Button
                      key={id}
                      label={`${draft.purposes.includes(id) ? draft.purposes.indexOf(id) + 1 + ". " : ""}${labels[id]}`}
                      selected={draft.purposes.includes(id)}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          purposes: toggleOrdered(draft.purposes, id),
                        })
                      }
                    />
                  ))}
                </>
              )}
              {step === 2 && (
                <>
                  <Body>Trần ngân sách tối đa (VND)</Body>
                  <TextInput
                    accessibilityLabel="Trần ngân sách VND"
                    placeholder="Ví dụ: 20000000"
                    placeholderTextColor={c.onSurfaceVariant}
                    keyboardType="number-pad"
                    value={draft.budget}
                    onChangeText={(budget) => setDraft({ ...draft, budget })}
                    style={input}
                  />
                  <Body muted>
                    Nhập số nguyên, không dấu phân cách. Phí chưa biết sẽ không
                    được tính bằng 0.
                  </Body>
                  <Body>
                    {/^\d+$/.test(draft.budget)
                      ? vnd(Number(draft.budget))
                      : "Chưa đặt ngân sách"}
                  </Body>
                </>
              )}
              {step === 3 && (
                <>
                  <Body>
                    Chọn đúng 3 ưu tiên theo thứ tự. Ưu tiên không bỏ qua ràng
                    buộc bắt buộc.
                  </Body>
                  {VALID_PRIORITIES.map((id) => (
                    <Button
                      key={id}
                      label={`${draft.priorities.includes(id) ? draft.priorities.indexOf(id) + 1 + ". " : ""}${labels[id]}`}
                      selected={draft.priorities.includes(id)}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          priorities: toggleOrdered(draft.priorities, id),
                        })
                      }
                    />
                  ))}
                </>
              )}
              {step === 4 && (
                <>
                  <Body>RAM tối thiểu (GB, tùy chọn)</Body>
                  <TextInput
                    accessibilityLabel="RAM tối thiểu"
                    value={draft.minRam}
                    onChangeText={(minRam) => setDraft({ ...draft, minRam })}
                    keyboardType="number-pad"
                    style={input}
                  />
                  <Body>Hệ điều hành bắt buộc (tùy chọn)</Body>
                  <TextInput
                    accessibilityLabel="Hệ điều hành bắt buộc"
                    placeholder="Ví dụ: Windows"
                    placeholderTextColor={c.onSurfaceVariant}
                    value={draft.os}
                    onChangeText={(os) => setDraft({ ...draft, os })}
                    style={input}
                  />
                  <Notice title="Chưa rõ thì để trống">
                    Ứng dụng không suy ra khả năng chạy phần mềm chỉ từ tên tác
                    vụ.
                  </Notice>
                </>
              )}
              {step === 5 && (
                <>
                  <Notice title={categories[draft.category]}>
                    <Body>
                      Trần: {vnd(profileOf(draft).budget.hardCeilingVnd)}
                    </Body>
                    <Body>
                      Mục đích:{" "}
                      {draft.purposes.map((x) => labels[x]).join(" → ")}
                    </Body>
                    <Body>
                      Ưu tiên:{" "}
                      {draft.priorities.map((x) => labels[x]).join(" → ")}
                    </Body>
                    <Body>
                      RAM: {draft.minRam || "Chưa yêu cầu"} · OS:{" "}
                      {draft.os || "Chưa yêu cầu"}
                    </Body>
                  </Notice>
                  <Body muted>
                    Giá trọn gói, hiệu năng và độ phù hợp vẫn cần bằng chứng.
                    Xác nhận không đồng nghĩa tất cả thiết bị đều đáp ứng.
                  </Body>
                </>
              )}
              <View style={s.row}>
                {step > 0 && (
                  <Button
                    label="Quay lại"
                    disabled={pending}
                    onPress={() => setStep(step - 1)}
                  />
                )}
                <Button
                  label={step === 5 ? "Xác nhận nhu cầu" : "Tiếp tục"}
                  selected
                  disabled={pending || boot !== "ready"}
                  onPress={() => {
                    setErrors([]);
                    if (step === 1 && draft.purposes.length !== 3) {
                      setErrors(["Chọn đúng ba mục đích."]);
                      return;
                    }
                    if (step === 3 && draft.priorities.length !== 3) {
                      setErrors(["Chọn đúng ba ưu tiên."]);
                      return;
                    }
                    if (
                      step === 2 &&
                      (!/^\d+$/.test(draft.budget) ||
                        !Number.isSafeInteger(Number(draft.budget)) ||
                        Number(draft.budget) <= 0)
                    ) {
                      setErrors(["Ngân sách phải là số nguyên VND lớn hơn 0."]);
                      return;
                    }
                    step === 5 ? confirm() : setStep(step + 1);
                  }}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!detail}
        transparent
        animationType="none"
        onRequestClose={() => setDetail(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000066",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <SafeAreaView
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: "94%",
              width: "100%",
              maxWidth: 760,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 24, gap: 18 }}>
              {detail && (
                <>
                  <View style={{ ...s.row, justifyContent: "space-between" }}>
                    <Body muted>
                      {historical ? "Bản lưu lịch sử" : "Thông số tham khảo"}
                    </Body>
                    <Button
                      quiet
                      label="Đóng"
                      onPress={() => setDetail(null)}
                    />
                  </View>
                  <Title small>{detail.modelName}</Title>
                  {notice && <Notice title={notice} />}
                  <Notice title="Chưa xác minh tổng chi phí">
                    Chưa có chào bán được duyệt; phí vận chuyển và phí bắt buộc
                    chưa biết. Không thể xác nhận giá thấp nhất hoặc đủ ngân
                    sách.
                  </Notice>
                  {Object.entries(detail.specifications).map(([k, v]) => (
                    <View
                      key={k}
                      style={{
                        flexDirection: "row",
                        gap: 16,
                        justifyContent: "space-between",
                      }}
                    >
                      <Body muted>
                        {(
                          {
                            ramGb: "RAM (GB)",
                            storageGb: "Lưu trữ (GB)",
                            cpu: "CPU",
                            os: "Hệ điều hành",
                            gpu: "Đồ họa",
                            displayInches: "Màn hình (inch)",
                          } as Record<string, string>
                        )[k] ?? k}
                      </Body>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Body>{String(v)}</Body>
                      </View>
                    </View>
                  ))}
                  <Title small>Nguồn & điều còn thiếu</Title>
                  <Body muted>
                    Thông tin do nhà bán lẻ công bố, chưa phải đo kiểm độc lập.
                    Quan sát ngày 14/11/2026; không phải thông tin giá hiện tại.
                  </Body>
                  {provenance.variants
                    .filter((p) => p.variantId === detail.variantId)
                    .map((p) => (
                      <Button
                        key={p.variantId}
                        label="Mở nguồn thông số"
                        quiet
                        onPress={() => Linking.openURL(p.sourceUrl)}
                      />
                    ))}
                  <Body>
                    Chưa có bằng chứng hiệu năng theo tác vụ. AI không được dùng
                    để lấp các dữ liệu còn thiếu.
                  </Body>
                  <View style={s.row}>
                    <Button label="So sánh" onPress={() => select(detail)} />
                    <Button
                      label="Lưu quyết định"
                      disabled={pending || boot !== "ready"}
                      onPress={() => save([detail])}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        visible={deleteId !== null}
        transparent
        onRequestClose={() => setDeleteId(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000066",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={[
              s.card,
              {
                backgroundColor: c.surface,
                maxWidth: 520,
                alignSelf: "center",
                width: "100%",
              },
            ]}
          >
            <Title small>
              {deleteId === "recover"
                ? "Đặt lại dữ liệu trên máy?"
                : "Xóa bản lưu?"}
            </Title>
            <Body>
              {deleteId === "all"
                ? `Xóa ${state.saved.length} quyết định đã lưu. Thao tác này không hoàn tác.`
                : deleteId === "recover"
                  ? "Chỉ tiếp tục sau khi đã xuất bản gốc. Dữ liệu cá nhân trên máy sẽ được đặt lại."
                  : "Bản lưu này sẽ không còn sau khi khởi động lại."}
            </Body>
            <Button
              label="Hủy"
              disabled={pending}
              onPress={() => setDeleteId(null)}
            />
            <Button
              label="Xác nhận xóa"
              disabled={pending}
              onPress={async () => {
                try {
                  if (deleteId === "recover") await recover();
                  else
                    await mutate(
                      (x) => ({
                        ...x,
                        saved:
                          deleteId === "all"
                            ? []
                            : x.saved.filter((s) => s.id !== deleteId),
                      }),
                      "Đã xóa bản lưu.",
                    );
                  setDeleteId(null);
                } catch {}
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
