import { CartCandidateCard } from "../components/CartCandidateCard";
import { latestPrice } from "../domain/price-tracking";
import {
  TrackPriceSheet,
  type TrackingRequest,
} from "../components/TrackPriceSheet";
import React, { useState } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Title, Notice, s } from "../ui";
import { vnd } from "../model";
import type { State } from "../storage";
import type { ProductVariant } from "../catalog";
export function CartsScreen({
  state,
  update,
  onCreate,
  onView,
  onCompare,
  priceTracking = false,
  onStartTracking,
}: {
  state: State;
  update: (fn: (x: State) => State) => Promise<State>;
  onCreate: () => void;
  priceTracking?: boolean;
  onStartTracking?: (r: TrackingRequest) => Promise<void>;
  onView: (v: ProductVariant) => void;
  onCompare: (v: ProductVariant[]) => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"recent" | "drop">("recent");
  const drop = (id: string) =>
    Math.min(
      0,
      ...state.cartData.candidates
        .filter((x) => x.cartId === id)
        .map(
          (x) =>
            latestPrice(x, state.offers, state.observations, Date.now())
              .delta ?? 0,
        ),
    );
  const carts = state.cartData.carts
    .filter(
      (x) =>
        !!x.archivedAt === archived &&
        [
          x.title,
          x.useCase,
          x.decisionNote,
          x.createdAt,
          ...state.cartData.candidates
            .filter((y) => y.cartId === x.id)
            .map(
              (y) =>
                y.decisionSnapshot.variant.modelName + " " + y.productVariantId,
            ),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "drop"
        ? drop(a.id) - drop(b.id)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  async function mutate(fn: (s: State) => State) {
    setBusy(true);
    try {
      await update(fn);
      setError("");
    } catch {
      setError("Không lưu được. Dữ liệu cũ được giữ nguyên.");
    } finally {
      setBusy(false);
    }
  }
  const allSelected = state.cartData.candidates.filter((x) =>
    selected.includes(x.id),
  );
  const visibleIds = state.cartData.candidates
    .filter((x) => carts.some((c) => c.id === x.cartId))
    .map((x) => x.id);
  const hidden = allSelected.filter((x) => !visibleIds.includes(x.id)).length;
  return (
    <View style={s.section}>
      <Title>Giỏ hàng</Title>
      <Body muted>
        {carts.length} · {t("Lý do gốc")}
      </Body>
      <Button label="Tạo giỏ mới" disabled={busy} onPress={onCreate} />
      <TextInput
        accessibilityLabel={t("Tên giỏ, thiết bị, SKU hoặc nguồn")}
        placeholder={t("Tên giỏ, thiết bị, SKU hoặc nguồn")}
        placeholderTextColor={c.onSurfaceVariant}
        value={query}
        onChangeText={setQuery}
        style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
      />
      <View style={s.row}>
        <Button
          label="Tất cả"
          selected={!archived}
          onPress={() => setArchived(false)}
        />
        <Button
          label="Đã lưu trữ"
          selected={archived}
          onPress={() => setArchived(true)}
        />
        <Button
          label="Mới cập nhật"
          selected={sort === "recent"}
          onPress={() => setSort("recent")}
        />
        <Button
          label="Giảm giá"
          selected={sort === "drop"}
          onPress={() => setSort("drop")}
        />
      </View>
      {sort === "drop" && <Body muted>Chưa kiểm tra giá</Body>}
      {!!error && <Notice title={error} />}
      {!carts.length && <Notice title="Chưa có giỏ hàng" />}
      {carts.map((cart) => {
        const candidates = state.cartData.candidates.filter(
          (x) => x.cartId === cart.id,
        );
        return (
          <View
            key={cart.id}
            style={{
              gap: 16,
              padding: 20,
              borderRadius: 16,
              backgroundColor: c.surfaceContainerLow,
            }}
          >
            <Title small>
              {cart.title === "Quyết định đã nhập" ? t(cart.title) : cart.title}
            </Title>
            <Body>
              {cart.budget === null ? t("Chưa xác định") : vnd(cart.budget)} ·{" "}
              {candidates.length}
            </Body>
            <Body muted>
              {cart.decisionNote || cart.useCase || t("Lý do gốc")}
            </Body>
            <Button
              label={opened === cart.id ? "Đóng" : "Xem cấu hình"}
              onPress={() => setOpened(opened === cart.id ? null : cart.id)}
            />
            {opened === cart.id &&
              candidates.map((candidate) => (
                <CartCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  offers={state.offers}
                  observations={state.observations}
                  selected={selected.includes(candidate.id)}
                  onSelect={() =>
                    setSelected((xs) =>
                      xs.includes(candidate.id)
                        ? xs.filter((x) => x !== candidate.id)
                        : xs.length < 4
                          ? [...xs, candidate.id]
                          : xs,
                    )
                  }
                  onView={() => onView(candidate.decisionSnapshot.variant)}
                  onTrack={
                    priceTracking ? () => setTracking(candidate.id) : undefined
                  }
                />
              ))}
            <View style={s.row}>
              <Button
                label={cart.archivedAt ? "Khôi phục giỏ" : "Lưu trữ giỏ"}
                disabled={busy}
                onPress={() =>
                  void mutate((x) => ({
                    ...x,
                    cartData: {
                      ...x.cartData,
                      carts: x.cartData.carts.map((c) =>
                        c.id === cart.id
                          ? {
                              ...c,
                              archivedAt: c.archivedAt
                                ? null
                                : new Date().toISOString(),
                            }
                          : c,
                      ),
                    },
                  }))
                }
              />
              <Button
                label="Xóa giỏ"
                disabled={busy}
                onPress={() => setDeleting(cart.id)}
              />
            </View>
          </View>
        );
      })}
      {allSelected.length > 0 && (
        <Notice title={t("So sánh") + " (" + allSelected.length + ")"}>
          <Body>
            {allSelected
              .map((x) => x.decisionSnapshot.variant.modelName)
              .join(" / ")}
          </Body>
          {hidden > 0 && (
            <Body>{hidden} hidden by filters / bị ẩn bởi bộ lọc</Body>
          )}
          <Button
            label="So sánh"
            disabled={allSelected.length < 2 || allSelected.length > 4}
            onPress={() =>
              onCompare(allSelected.map((x) => x.decisionSnapshot.variant))
            }
          />
        </Notice>
      )}
      {priceTracking && (
        <TrackPriceSheet
          candidateId={tracking}
          onClose={() => setTracking(null)}
          onStart={onStartTracking}
        />
      )}
      <Modal
        visible={!!deleting}
        transparent
        onRequestClose={() => {
          if (!busy) setDeleting(null);
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
            <Title small>Xóa giỏ</Title>
            <Body>Dữ liệu không thể khôi phục sau khi xóa.</Body>
            <Button
              label="Hủy"
              disabled={busy}
              onPress={() => setDeleting(null)}
            />
            <Button
              label="Xác nhận xóa"
              disabled={busy}
              onPress={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await update((x) => {
                    const removed = new Set(
                      x.cartData.candidates
                        .filter((y) => y.cartId === deleting)
                        .map((y) => y.id),
                    );
                    const legacyIds = Object.entries(x.cartData.legacyMap)
                      .filter(([, ids]) => ids.some((id) => removed.has(id)))
                      .map(([id]) => id);
                    const removedRules = new Set(
                      x.trackingRules
                        .filter((r) => removed.has(r.candidateId))
                        .map((r) => r.id),
                    );
                    return {
                      ...x,
                      legacyRaw: undefined,
                      saved: x.saved.filter((y) => !legacyIds.includes(y.id)),
                      trackingRules: x.trackingRules.filter(
                        (r) => !removedRules.has(r.id),
                      ),
                      alertDeliveries: x.alertDeliveries.filter(
                        (d) => !removedRules.has(d.trackingRuleId),
                      ),
                      cartData: {
                        ...x.cartData,
                        carts: x.cartData.carts.filter(
                          (y) => y.id !== deleting,
                        ),
                        candidates: x.cartData.candidates.filter(
                          (y) => y.cartId !== deleting,
                        ),
                        legacyMap: Object.fromEntries(
                          Object.entries(x.cartData.legacyMap).filter(
                            ([id]) => !legacyIds.includes(id),
                          ),
                        ),
                      },
                    };
                  });
                  setDeleting(null);
                } catch {
                  setError("Không lưu được. Dữ liệu cũ được giữ nguyên.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
