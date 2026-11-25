import { CartCandidateCard } from "../components/CartCandidateCard";
import { latestPrice, type TrackingRule } from "../domain/price-tracking";
import {
  removeCandidateFromCart,
  updateCartDetails,
  type Cart,
  type CartCandidate,
} from "../domain/carts";
import { normalizeSearchText, sourceOf } from "../domain/filters";
import { sourceLabel } from "../domain/official";
import {
  TrackPriceSheet,
  type TrackingRequest,
} from "../components/TrackPriceSheet";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, EmptyState, Notice, Title, s } from "../ui";
import { vnd } from "../model";
import type { State } from "../storage";
import type { ProductVariant } from "../catalog";

export function CartsScreen({
  active = true,
  state,
  mutate,
  onCreate,
  onView,
  onCompare,
  priceTracking = false,
  onStartTracking,
}: {
  active?: boolean;
  state: State;
  mutate: (fn: (x: State) => State, ack?: string) => Promise<State>;
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
  const [editing, setEditing] = useState<Cart | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUseCase, setEditUseCase] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editNote, setEditNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<"recent" | "drop">("recent");

  useEffect(() => {
    const validCandidates = new Set(state.cartData.candidates.map((x) => x.id));
    const validCarts = new Set(state.cartData.carts.map((x) => x.id));
    setSelected((xs) => {
      const next = xs.filter((id) => validCandidates.has(id));
      return next.length === xs.length ? xs : next;
    });
    if (opened && !validCarts.has(opened)) setOpened(null);
    if (tracking && !validCandidates.has(tracking)) setTracking(null);
    if (deleting && !validCarts.has(deleting)) setDeleting(null);
    if (editing && !validCarts.has(editing.id)) setEditing(null);
  }, [state.cartData, opened, tracking, deleting, editing]);

  const candidatesByCartId = useMemo(() => {
    const map = new Map<string, CartCandidate[]>();
    for (const candidate of state.cartData.candidates) {
      const list = map.get(candidate.cartId);
      if (list) list.push(candidate);
      else map.set(candidate.cartId, [candidate]);
    }
    return map;
  }, [state.cartData.candidates]);

  const now = active ? Date.now() : 0;

  const dropByCartId = useMemo(() => {
    if (!active || sort !== "drop") return new Map<string, number>();
    const map = new Map<string, number>();
    for (const cart of state.cartData.carts) {
      const list = candidatesByCartId.get(cart.id) ?? [];
      const minDelta = Math.min(
        0,
        ...list.map(
          (x) =>
            latestPrice(x, state.offers, state.observations, now).delta ?? 0,
        ),
      );
      map.set(cart.id, minDelta);
    }
    return map;
  }, [
    active,
    sort,
    state.cartData.carts,
    candidatesByCartId,
    state.offers,
    state.observations,
    now,
  ]);

  const carts = useMemo(() => {
    const tokens = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
    return state.cartData.carts
      .filter((x) => {
        if (!!x.archivedAt !== archived) return false;
        if (!tokens.length) return true;
        const list = candidatesByCartId.get(x.id) ?? [];
        const offerById = new Map(state.offers.map((o) => [o.id, o]));
        const haystack = normalizeSearchText(
          [
            x.title,
            x.useCase,
            x.decisionNote,
            x.createdAt,
            ...list.flatMap((y) => {
              const v = y.decisionSnapshot.variant;
              const src = sourceOf(v);
              const offerSrc = y.savedOfferId
                ? offerById.get(y.savedOfferId)?.retailerId ?? ""
                : "";
              return [
                v.modelName,
                y.productVariantId,
                src,
                sourceLabel(src),
                offerSrc,
                sourceLabel(offerSrc),
              ];
            }),
          ].join(" "),
        );
        return tokens.every((tok) => haystack.includes(tok));
      })
      .sort((a, b) =>
        sort === "drop"
          ? (dropByCartId.get(a.id) ?? 0) - (dropByCartId.get(b.id) ?? 0)
          : b.updatedAt.localeCompare(a.updatedAt),
      );
  }, [
    state.cartData.carts,
    state.offers,
    archived,
    query,
    candidatesByCartId,
    sort,
    dropByCartId,
  ]);

  async function runMutation(fn: (s: State) => State, ack?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await mutate(fn, ack);
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
  const visibleIds = new Set(
    carts.flatMap((c) => (candidatesByCartId.get(c.id) ?? []).map((x) => x.id)),
  );
  const hidden = allSelected.filter((x) => !visibleIds.has(x.id)).length;
  const activeRule: TrackingRule | undefined = tracking
    ? state.trackingRules.find((r) => r.candidateId === tracking)
    : undefined;

  function openEdit(cart: Cart) {
    setEditing(cart);
    setEditTitle(cart.title);
    setEditUseCase(cart.useCase);
    setEditBudget(cart.budget != null ? String(cart.budget) : "");
    setEditNote(cart.decisionNote);
  }

  return (
    <View style={s.section}>
      <Title>Giỏ hàng</Title>
      <Body muted>
        {carts.length} {t("giỏ hàng")}
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
      {sort === "drop" && state.observations.length === 0 && (
        <Body muted>Chưa kiểm tra giá</Body>
      )}
      {!!error && <Notice live tone="error" title={error} />}
      {!carts.length && (
        <EmptyState
          title="Chưa có giỏ hàng"
          description="Lưu các cấu hình quan tâm từ Trang chủ để theo dõi giá hoặc so sánh song song."
        />
      )}
      {carts.map((cart) => {
        const candidates = candidatesByCartId.get(cart.id) ?? [];
        const isOpened = opened === cart.id;
        return (
          <View
            key={cart.id}
            style={{
              gap: 14,
              padding: 20,
              borderRadius: 16,
              backgroundColor: c.surfaceContainerLow,
            }}
          >
            <Title small>
              {cart.title === "Quyết định đã nhập" ? t(cart.title) : cart.title}
            </Title>
            <Body>
              {cart.budget === null
                ? t("Chưa xác định")
                : vnd(cart.budget, t("Chưa xác định"))}{" "}
              · {candidates.length} {t("cấu hình")}
            </Body>
            <Body muted>
              {cart.decisionNote || cart.useCase || t("Lý do gốc")}
            </Body>
            <View style={s.row}>
              <Button
                label={isOpened ? "Đóng" : "Xem cấu hình"}
                onPress={() => setOpened(isOpened ? null : cart.id)}
              />
              <Button
                quiet
                label="Sửa giỏ"
                disabled={busy}
                onPress={() => openEdit(cart)}
              />
            </View>
            {isOpened &&
              candidates.map((candidate) => (
                <CartCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  offers={state.offers}
                  observations={state.observations}
                  selected={selected.includes(candidate.id)}
                  selectDisabled={selected.length >= 4}
                  now={now}
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
                  onRemove={() =>
                    void runMutation((x) => {
                      const at = new Date().toISOString();
                      const removedRuleIds = new Set(
                        x.trackingRules
                          .filter((r) => r.candidateId === candidate.id)
                          .map((r) => r.id),
                      );
                      return {
                        ...x,
                        trackingRules: x.trackingRules.filter(
                          (r) => r.candidateId !== candidate.id,
                        ),
                        alertDeliveries: x.alertDeliveries.filter(
                          (d) => !removedRuleIds.has(d.trackingRuleId),
                        ),
                        cartData: removeCandidateFromCart(
                          x.cartData,
                          candidate.id,
                          at,
                        ),
                      };
                    })
                  }
                />
              ))}
            <View style={s.row}>
              <Button
                label={cart.archivedAt ? "Khôi phục giỏ" : "Lưu trữ giỏ"}
                disabled={busy}
                onPress={() =>
                  void runMutation((x) => {
                    const at = new Date().toISOString();
                    return {
                      ...x,
                      cartData: {
                        ...x.cartData,
                        carts: x.cartData.carts.map((c) =>
                          c.id === cart.id
                            ? {
                                ...c,
                                archivedAt: c.archivedAt
                                  ? null
                                  : Date.parse(at) >= Date.parse(c.createdAt)
                                    ? at
                                    : c.createdAt,
                                updatedAt:
                                  Date.parse(at) >= Date.parse(c.createdAt)
                                    ? at
                                    : c.createdAt,
                              }
                            : c,
                        ),
                      },
                    };
                  })
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
        <Notice title={t("So sánh") + " (" + allSelected.length + "/4)"}>
          <Body>
            {allSelected
              .map((x) => x.decisionSnapshot.variant.modelName)
              .join(" / ")}
          </Body>
          {allSelected.length === 1 && (
            <Body muted>Chọn thêm ít nhất 1 cấu hình nữa để so sánh.</Body>
          )}
          {hidden > 0 && (
            <Body>
              {hidden} {t("cấu hình đang ẩn theo bộ lọc")}
            </Body>
          )}
          <View style={s.row}>
            <Button
              label="So sánh"
              selected
              disabled={allSelected.length < 2 || allSelected.length > 4}
              onPress={() => {
                const seen = new Set<string>();
                const deduped: ProductVariant[] = [];
                for (const item of allSelected) {
                  if (!seen.has(item.productVariantId)) {
                    seen.add(item.productVariantId);
                    deduped.push(item.decisionSnapshot.variant);
                  }
                }
                onCompare(deduped);
              }}
            />
            <Button
              quiet
              label="Bỏ chọn tất cả"
              onPress={() => setSelected([])}
            />
          </View>
        </Notice>
      )}
      {priceTracking && (
        <TrackPriceSheet
          candidateId={tracking}
          initialTargetAmount={activeRule?.targetAmount ?? null}
          initialNotifications={activeRule?.notificationsEnabled ?? false}
          onClose={() => setTracking(null)}
          onStart={onStartTracking}
        />
      )}

      <Modal
        visible={!!editing}
        transparent
        onRequestClose={() => {
          if (!busy) setEditing(null);
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
            <Title small>Sửa giỏ</Title>
            <TextInput
              accessibilityLabel={t("Tên giỏ")}
              placeholder={t("Tên giỏ")}
              placeholderTextColor={c.onSurfaceVariant}
              maxLength={80}
              value={editTitle}
              onChangeText={setEditTitle}
              style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
            />
            <TextInput
              accessibilityLabel={t("Mục đích sử dụng")}
              placeholder={t("Mục đích sử dụng")}
              placeholderTextColor={c.onSurfaceVariant}
              maxLength={120}
              value={editUseCase}
              onChangeText={setEditUseCase}
              style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
            />
            <TextInput
              accessibilityLabel={t("Ngân sách")}
              placeholder={t("Ngân sách")}
              placeholderTextColor={c.onSurfaceVariant}
              keyboardType="number-pad"
              maxLength={12}
              value={editBudget}
              onChangeText={(x) => setEditBudget(x.replace(/[^0-9]/g, ""))}
              style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
            />
            <TextInput
              accessibilityLabel={t("Ghi chú")}
              placeholder={t("Ghi chú")}
              placeholderTextColor={c.onSurfaceVariant}
              maxLength={500}
              multiline
              value={editNote}
              onChangeText={setEditNote}
              style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
            />
            <View style={s.row}>
              <Button
                label="Hủy"
                disabled={busy}
                onPress={() => setEditing(null)}
              />
              <Button
                label="Lưu thay đổi"
                selected
                disabled={
                  busy ||
                  (!!editBudget &&
                    (!Number.isSafeInteger(Number(editBudget)) ||
                      Number(editBudget) <= 0))
                }
                onPress={() => {
                  if (!editing) return;
                  void runMutation((x) => ({
                    ...x,
                    cartData: updateCartDetails(
                      x.cartData,
                      editing.id,
                      {
                        title: editTitle,
                        useCase: editUseCase,
                        budget: editBudget ? Number(editBudget) : null,
                        decisionNote: editNote,
                      },
                      new Date().toISOString(),
                    ),
                  })).then(() => setEditing(null));
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

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
            <Title small>Xóa giỏ</Title>
            <Body>Dữ liệu không thể khôi phục sau khi xóa.</Body>
            <View style={s.row}>
              <Button
                label="Hủy"
                disabled={busy}
                onPress={() => setDeleting(null)}
              />
              <Button
                label="Xác nhận xóa"
                variant="destructive"
                disabled={busy}
                onPress={async () => {
                  if (busy || !deleting) return;
                  const targetCart = deleting;
                  setBusy(true);
                  try {
                    await mutate((x) => {
                      const removed = new Set(
                        x.cartData.candidates
                          .filter((y) => y.cartId === targetCart)
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
                        saved: x.saved.filter(
                          (y) => !legacyIds.includes(y.id),
                        ),
                        trackingRules: x.trackingRules.filter(
                          (r) => !removedRules.has(r.id),
                        ),
                        alertDeliveries: x.alertDeliveries.filter(
                          (d) => !removedRules.has(d.trackingRuleId),
                        ),
                        cartData: {
                          ...x.cartData,
                          carts: x.cartData.carts.filter(
                            (y) => y.id !== targetCart,
                          ),
                          candidates: x.cartData.candidates.filter(
                            (y) => y.cartId !== targetCart,
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
        </View>
      </Modal>
    </View>
  );
}
