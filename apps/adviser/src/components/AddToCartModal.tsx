import React, { useEffect, useState } from "react";
import { Modal, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ProductVariant } from "../catalog";
import type { State } from "../storage";
import { addCandidates, type Cart } from "../domain/carts";
import { officialOffer, offerTotal } from "../domain/official";
import { useCatalog } from "../catalog-context";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { vnd } from "../model";
import { Button, Title, Body, Notice, s } from "../ui";
import { OfficialPrice } from "./OfficialPrice";

export function AddToCartModal({
  variants,
  visible,
  boot = "ready",
  state,
  mutate,
  onClose,
  onSaved,
  catalogVersion = "unknown",
}: {
  variants: ProductVariant[];
  visible: boolean;
  boot?: string;
  state: State;
  mutate: (fn: (s: State) => State, ack?: string) => Promise<State>;
  onClose: () => void;
  onSaved?: () => void;
  catalogVersion?: string;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const catalog = useCatalog();
  const isCreateOnly = variants.length === 0;
  const [chosen, setChosen] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [useCase, setUseCase] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setChosen("");
      setTitle("");
      setNote("");
      setUseCase("");
      setBudget("");
      setError("");
    }
  }, [visible]);

  const duplicates =
    !isCreateOnly && chosen
      ? state.cartData.candidates.filter(
          (x) =>
            x.cartId === chosen &&
            variants.some((v) => v.variantId === x.productVariantId) &&
            (() => {
              const o = officialOffer(catalog, x.productVariantId);
              return x.savedOfferId === (o ? o.sourceId + ":" + o.externalOfferId : null);
            })(),
        ).length
      : 0;

  async function save() {
    if (busy || boot !== "ready") return;
    if (
      budget &&
      (!Number.isSafeInteger(Number(budget)) || Number(budget) <= 0)
    ) {
      setError("Ngân sách phải là số nguyên VND lớn hơn 0.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const at = new Date().toISOString();
      const existing = isCreateOnly
        ? undefined
        : state.cartData.carts.find((x) => x.id === chosen);
      const cart: Cart = existing ?? {
        id: Date.now().toString() + ":" + Math.random().toString(36).slice(2),
        title: title.trim() || t("Giỏ hàng"),
        useCase: useCase.trim(),
        budget: budget
          ? Number(budget)
          : (state.confirmed?.budget.hardCeilingVnd ?? null),
        currency: "VND",
        decisionNote: note.trim(),
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
      };
      await mutate(
        (x) => ({
          ...x,
          cartData: addCandidates(
            x.cartData,
            cart,
            variants,
            x.confirmed,
            catalogVersion,
            at,
            (variant) => {
              const offer = officialOffer(catalog, variant.variantId);
              if (!offer)
                return {
                  savedOfferId: null,
                  baselineAmount: null,
                  baselinePriceBasis: "unknown",
                };
              return {
                savedOfferId: offer.sourceId + ":" + offer.externalOfferId,
                baselineAmount: offerTotal(offer),
                baselinePriceBasis: "complete",
              };
            },
          ),
        }),
        isCreateOnly ? "Đã tạo giỏ mới." : "Đã thêm vào giỏ.",
      );
      onSaved?.();
      onClose();
    } catch {
      setError("Không lưu được. Dữ liệu cũ được giữ nguyên.");
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    { label: "Tên giỏ", val: title, set: setTitle, max: 80, numeric: false, multi: false },
    { label: "Mục đích sử dụng", val: useCase, set: setUseCase, max: 120, numeric: false, multi: false },
    { label: "Ngân sách", val: budget, set: (x: string) => setBudget(x.replace(/[^0-9]/g, "")), max: 12, numeric: true, multi: false },
    { label: "Ghi chú", val: note, set: setNote, max: 500, numeric: false, multi: true },
  ];

  return (
    <Modal
      visible={visible}
      onRequestClose={() => {
        if (!busy) onClose();
      }}
      animationType="none"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            gap: 18,
            maxWidth: 720,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Title>{isCreateOnly ? "Tạo giỏ mới" : "Thêm vào giỏ"}</Title>
          {!isCreateOnly && (
            <Body>{variants.map((v) => v.modelName).join(" / ")}</Body>
          )}
          {!isCreateOnly && (
            <>
              <Button
                label="Tạo giỏ mới"
                selected={!chosen}
                onPress={() => setChosen("")}
              />
              {state.cartData.carts
                .filter((x) => !x.archivedAt)
                .map((x) => (
                  <Button
                    key={x.id}
                    label={x.title}
                    selected={chosen === x.id}
                    onPress={() => setChosen(x.id)}
                  />
                ))}
            </>
          )}
          {(isCreateOnly || !chosen) &&
            fields.map((f) => (
              <View key={f.label} style={{ gap: 6 }}>
                <Body>
                  {t(f.label)} ({t("Không bắt buộc")})
                </Body>
                <TextInput
                  accessibilityLabel={t(f.label)}
                  value={f.val}
                  onChangeText={f.set}
                  maxLength={f.max}
                  keyboardType={f.numeric ? "number-pad" : "default"}
                  multiline={f.multi}
                  style={[
                    s.input,
                    { color: c.onSurface, borderColor: c.outline },
                  ]}
                />
                {f.numeric && !!f.val && Number.isSafeInteger(Number(f.val)) && (
                  <Body muted>{vnd(Number(f.val), "")}</Body>
                )}
              </View>
            ))}
          {duplicates > 0 && (
            <Notice
              title={
                duplicates +
                " cấu hình đã có; dùng lại bản gốc, không tạo trùng."
              }
            />
          )}
          {!!error && <Notice live tone="error" title={error} />}
          {!isCreateOnly && variants.length === 1 && (
            <OfficialPrice variantId={variants[0].variantId} variant={variants[0]} />
          )}
          {!isCreateOnly && variants.length > 1 && (
            <Body muted>
              Chỉ các cấu hình có giá chính thức mới lưu mức giá đối chiếu.
            </Body>
          )}
          <View style={s.row}>
            <Button label="Hủy" disabled={busy} onPress={onClose} />
            <Button
              label={isCreateOnly ? "Tạo giỏ" : "Thêm vào giỏ"}
              selected
              disabled={busy || boot !== "ready"}
              onPress={() => void save()}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
