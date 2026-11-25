import React from "react";
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Body, Notice, SectionCard, Title, s } from "../ui";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import {
  categories,
  labels,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
  changeCategory,
  toggleOrdered,
  profileOf,
  vnd,
  type Draft,
  type DeviceCategory,
} from "../model";

const steps = [
  "Thiết bị",
  "Mục đích",
  "Ngân sách",
  "Ưu tiên",
  "Làm rõ",
  "Xem lại",
];

type Props = {
  intake: boolean;
  setIntake: (x: boolean) => void;
  step: number;
  setStep: (x: number) => void;
  draft: Draft;
  setDraft: (x: Draft) => void;
  errors: string[];
  setErrors: (x: string[]) => void;
  pending: boolean;
  boot: string;
  confirm: () => void;
};

export function NeedsModal({
  intake,
  setIntake,
  step,
  setStep,
  draft,
  setDraft,
  errors,
  setErrors,
  pending,
  boot,
  confirm,
}: Props) {
  const { c } = useTheme();
  const { t } = useLocale();
  const input = {
    ...s.input,
    color: c.onSurface,
    borderColor: c.outline,
    backgroundColor: c.surface,
  };

  function closeModal() {
    if (pending) return;
    setErrors([]);
    setIntake(false);
  }

  const budgetValid =
    /^\d+$/.test(draft.budget) &&
    Number.isSafeInteger(Number(draft.budget)) &&
    Number(draft.budget) > 0;

  return (
    <Modal
      visible={intake}
      animationType="none"
      onRequestClose={() => {
        if (pending) return;
        setErrors([]);
        if (step) setStep(step - 1);
        else setIntake(false);
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 8,
              maxWidth: 720,
              width: "100%",
              alignSelf: "center",
              gap: 10,
            }}
          >
            <View style={{ ...s.row, justifyContent: "space-between" }}>
              <Body muted>{t("Bước")} {step + 1} / 6</Body>
              <Button quiet label="Hủy" disabled={pending} onPress={closeModal} />
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: c.surfaceContainerHighest,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${((step + 1) / 6) * 100}%`,
                  backgroundColor: c.primary,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 24,
              paddingTop: 12,
              gap: 18,
              maxWidth: 720,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <Title>{steps[step]}</Title>
            <Body muted>
              Chỉ thay đổi nhu cầu đang dùng sau khi bạn xác nhận.
            </Body>
            {errors.map((e, i) => (
              <Text
                key={i}
                accessibilityRole="alert"
                style={{ color: c.error, fontSize: 16, fontWeight: "600" }}
              >
                {t(e)}
              </Text>
            ))}

            {step === 0 && (
              <View style={{ gap: 12 }}>
                {Object.entries(categories).map(([id, label]) => (
                  <Button
                    key={id}
                    label={label}
                    selected={draft.category === id}
                    onPress={() => {
                      setErrors([]);
                      setDraft(changeCategory(draft, id as DeviceCategory));
                    }}
                  />
                ))}
              </View>
            )}

            {step === 1 && (
              <View style={{ gap: 12 }}>
                <Body>
                  Chọn đúng 3 mục đích theo thứ tự quan trọng. Bỏ chọn rồi chọn
                  lại để đổi thứ tự.
                </Body>
                <Body muted>
                  {t("Đã chọn")} {draft.purposes.length}/3
                </Body>
                {CATEGORY_PURPOSES[draft.category].map((id) => {
                  const picked = draft.purposes.includes(id);
                  const full = draft.purposes.length >= 3 && !picked;
                  return (
                    <View key={id} style={{ opacity: full ? 0.65 : 1 }}>
                      <Button
                        label={`${picked ? draft.purposes.indexOf(id) + 1 + ". " : ""}${labels[id]}`}
                        selected={picked}
                        onPress={() => {
                          setErrors([]);
                          setDraft({
                            ...draft,
                            purposes: toggleOrdered(draft.purposes, id),
                          });
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            )}

            {step === 2 && (
              <View style={{ gap: 12 }}>
                <Body>Trần ngân sách tối đa (VND)</Body>
                <TextInput
                  accessibilityLabel={t("Trần ngân sách VND")}
                  placeholder={t("Ví dụ: 20000000")}
                  placeholderTextColor={c.onSurfaceVariant}
                  keyboardType="number-pad"
                  maxLength={12}
                  value={draft.budget}
                  onChangeText={(raw) => {
                    setErrors([]);
                    setDraft({
                      ...draft,
                      budget: raw.replace(/[.,\s]/g, ""),
                    });
                  }}
                  style={input}
                />
                <Body muted>
                  Nhập số nguyên, không dấu phân cách. Phí chưa biết sẽ không
                  được tính bằng 0.
                </Body>
                <Body>
                  {budgetValid
                    ? vnd(Number(draft.budget), t("Chưa xác định"))
                    : t("Chưa đặt ngân sách")}
                </Body>
              </View>
            )}

            {step === 3 && (
              <View style={{ gap: 12 }}>
                <Body>
                  Chọn đúng 3 ưu tiên theo thứ tự. Ưu tiên không bỏ qua ràng
                  buộc bắt buộc.
                </Body>
                <Body muted>
                  {t("Đã chọn")} {draft.priorities.length}/3
                </Body>
                {VALID_PRIORITIES.map((id) => {
                  const picked = draft.priorities.includes(id);
                  const full = draft.priorities.length >= 3 && !picked;
                  return (
                    <View key={id} style={{ opacity: full ? 0.65 : 1 }}>
                      <Button
                        label={`${picked ? draft.priorities.indexOf(id) + 1 + ". " : ""}${labels[id]}`}
                        selected={picked}
                        onPress={() => {
                          setErrors([]);
                          setDraft({
                            ...draft,
                            priorities: toggleOrdered(draft.priorities, id),
                          });
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            )}

            {step === 4 && (
              <View style={{ gap: 12 }}>
                <Body>RAM tối thiểu (GB, tùy chọn)</Body>
                <TextInput
                  accessibilityLabel={t("RAM tối thiểu")}
                  placeholder={t("Ví dụ: 16")}
                  placeholderTextColor={c.onSurfaceVariant}
                  value={draft.minRam}
                  maxLength={4}
                  onChangeText={(minRam) => {
                    setErrors([]);
                    setDraft({ ...draft, minRam: minRam.replace(/[^0-9]/g, "") });
                  }}
                  keyboardType="number-pad"
                  style={input}
                />
                <Body>Hệ điều hành bắt buộc (tùy chọn)</Body>
                <TextInput
                  accessibilityLabel={t("Hệ điều hành bắt buộc")}
                  placeholder={t("Ví dụ: Windows")}
                  placeholderTextColor={c.onSurfaceVariant}
                  maxLength={60}
                  value={draft.os}
                  onChangeText={(os) => {
                    setErrors([]);
                    setDraft({ ...draft, os });
                  }}
                  style={input}
                />
                <Notice title="Chưa rõ thì để trống">
                  Ứng dụng không suy ra khả năng chạy phần mềm chỉ từ tên tác
                  vụ.
                </Notice>
              </View>
            )}

            {step === 5 && (
              <>
                <SectionCard>
                  <Title small>{categories[draft.category]}</Title>
                  <Body>
                    {t("Trần")}:{" "}
                    {vnd(
                      profileOf(draft).budget.hardCeilingVnd,
                      t("Chưa xác định"),
                    )}
                  </Body>
                  <Body>
                    {t("Mục đích")}:{" "}
                    {draft.purposes.map((x) => t(labels[x])).join(" → ")}
                  </Body>
                  <Body>
                    {t("Ưu tiên")}:{" "}
                    {draft.priorities.map((x) => t(labels[x])).join(" → ")}
                  </Body>
                  <Body>
                    RAM: {draft.minRam ? `${draft.minRam} GB` : t("Chưa yêu cầu")} ·{" "}
                    {t("HĐH")}: {draft.os.trim() || t("Chưa yêu cầu")}
                  </Body>
                  <View style={s.row}>
                    {[
                      [0, "Sửa thiết bị"],
                      [1, "Sửa mục đích"],
                      [2, "Sửa ngân sách"],
                      [3, "Sửa ưu tiên"],
                      [4, "Sửa làm rõ"],
                    ].map(([idx, label]) => (
                      <Button
                        key={String(idx)}
                        quiet
                        label={label as string}
                        disabled={pending}
                        onPress={() => {
                          setErrors([]);
                          setStep(idx as number);
                        }}
                      />
                    ))}
                  </View>
                </SectionCard>
                <Body muted>
                  Giá trọn gói, hiệu năng và độ phù hợp vẫn cần bằng chứng. Xác
                  nhận không đồng nghĩa tất cả thiết bị đều đáp ứng.
                </Body>
              </>
            )}
          </ScrollView>

          <View
            style={{
              padding: 16,
              backgroundColor: c.surfaceContainer,
              borderTopWidth: 1,
              borderColor: c.outlineVariant,
            }}
          >
            <View
              style={{
                ...s.row,
                justifyContent: step > 0 ? "space-between" : "flex-end",
                maxWidth: 720,
                width: "100%",
                alignSelf: "center",
              }}
            >
              {step > 0 && (
                <Button
                  label="Quay lại"
                  disabled={pending}
                  onPress={() => {
                    setErrors([]);
                    setStep(step - 1);
                  }}
                />
              )}
              <Button
                label={step === 5 ? "Xác nhận nhu cầu" : "Tiếp tục"}
                selected
                disabled={pending || (step === 5 && boot !== "ready")}
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
                  if (step === 2 && !budgetValid) {
                    setErrors(["Ngân sách phải là số nguyên VND lớn hơn 0."]);
                    return;
                  }
                  if (
                    step === 4 &&
                    draft.minRam &&
                    (!/^\d+$/.test(draft.minRam) ||
                      !Number.isSafeInteger(Number(draft.minRam)) ||
                      Number(draft.minRam) <= 0)
                  ) {
                    setErrors(["RAM phải là số nguyên dương."]);
                    return;
                  }
                  step === 5 ? confirm() : setStep(step + 1);
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
