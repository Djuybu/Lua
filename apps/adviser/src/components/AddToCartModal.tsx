import React, { useEffect, useState } from "react";
import { Modal, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ProductVariant } from "../catalog";
import type { State } from "../storage";
import { addCandidates, type Cart } from "../domain/carts";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Button, Title, Body, Notice, s } from "../ui";
export function AddToCartModal({
  variants,
  visible,
  state,
  update,
  onClose,
  onSaved,
  catalogVersion = "unknown",
}: {
  variants: ProductVariant[];
  visible: boolean;
  state: State;
  update: (fn: (s: State) => State) => Promise<State>;
  onClose: () => void;
  onSaved?: () => void;
  catalogVersion?: string;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
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
  const duplicates = chosen
    ? state.cartData.candidates.filter(
        (x) =>
          x.cartId === chosen &&
          x.savedOfferId === null &&
          variants.some((v) => v.variantId === x.productVariantId),
      ).length
    : 0;
  async function save() {
    if (busy) return;
    if (
      budget &&
      (!Number.isSafeInteger(Number(budget)) || Number(budget) < 0)
    ) {
      setError("Ngân sách không hợp lệ.");
      return;
    }
    setBusy(true);
    try {
      const at = new Date().toISOString();
      const existing = state.cartData.carts.find((x) => x.id === chosen);
      const cart: Cart = existing ?? {
        id: Date.now().toString() + ":" + Math.random().toString(36).slice(2),
        title: title.trim() || t("Giỏ hàng"),
        useCase,
        budget: budget
          ? Number(budget)
          : (state.confirmed?.budget.hardCeilingVnd ?? null),
        currency: "VND",
        decisionNote: note,
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
      };
      await update((x) => ({
        ...x,
        cartData: addCandidates(
          x.cartData,
          cart,
          variants,
          x.confirmed,
          catalogVersion,
          at,
        ),
      }));
      onSaved?.();
      onClose();
    } catch {
      setError("Không lưu được. Dữ liệu cũ được giữ nguyên.");
    } finally {
      setBusy(false);
    }
  }
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
          <Title>Thêm vào giỏ</Title>
          <Body>{variants.map((v) => v.modelName).join(" / ")}</Body>
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
          {!chosen &&
            (
              ["Tên giỏ", "Mục đích sử dụng", "Ngân sách", "Ghi chú"] as const
            ).map((label, i) => (
              <View key={label} style={{ gap: 6 }}>
                <Body>
                  {t(label)} ({t("Không bắt buộc")})
                </Body>
                <TextInput
                  accessibilityLabel={t(label)}
                  value={[title, useCase, budget, note][i]}
                  onChangeText={
                    [
                      setTitle,
                      setUseCase,
                      (x: string) => setBudget(x.replace(/[^0-9]/g, "")),
                      setNote,
                    ][i]
                  }
                  keyboardType={i === 2 ? "number-pad" : "default"}
                  multiline={i === 3}
                  style={[
                    s.input,
                    { color: c.onSurface, borderColor: c.outline },
                  ]}
                />
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
          {!!error && <Notice title={error} />}
          <Body muted>Chưa có giá trọn gói đã xác minh</Body>
          <View style={s.row}>
            <Button label="Hủy" disabled={busy} onPress={onClose} />
            <Button
              label="Thêm vào giỏ"
              selected
              disabled={busy}
              onPress={() => void save()}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
