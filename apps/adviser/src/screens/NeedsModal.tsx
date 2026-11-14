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
import { Button, Body, Notice, Title, s } from "../ui";
import { useTheme } from "../theme";
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
  const input = {
    ...s.input,
    color: c.onSurface,
    borderColor: c.outline,
    backgroundColor: c.surface,
  };
  return (
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
                  Chọn đúng 3 mục đích theo thứ tự quan trọng. Bỏ chọn rồi chọn
                  lại để đổi thứ tự.
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
                    Mục đích: {draft.purposes.map((x) => labels[x]).join(" → ")}
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
                  Giá trọn gói, hiệu năng và độ phù hợp vẫn cần bằng chứng. Xác
                  nhận không đồng nghĩa tất cả thiết bị đều đáp ứng.
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
  );
}
