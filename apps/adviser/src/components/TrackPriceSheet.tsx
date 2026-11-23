import React, { useState } from "react";
import { Modal, View, TextInput } from "react-native";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Notice, Title, s } from "../ui";
export type TrackingRequest = {
  candidateId: string;
  targetAmount: number | null;
  notificationsEnabled: boolean;
};
export function TrackPriceSheet({
  candidateId,
  onClose,
  onStart,
}: {
  candidateId: string | null;
  onClose: () => void;
  onStart?: (r: TrackingRequest) => Promise<void>;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const [target, setTarget] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      visible={!!candidateId}
      transparent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#00000066",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View style={[s.card, { backgroundColor: c.surface }]}>
          <Title small>Theo dõi giá</Title>
          <Body muted>Chưa kiểm tra giá</Body>
          {!onStart && (
            <Notice title="Chưa có hợp đồng kết nối dịch vụ theo dõi giá." />
          )}
          <TextInput
            accessibilityLabel={t("Giá mong muốn")}
            placeholder={t("Giá mong muốn")}
            placeholderTextColor={c.onSurfaceVariant}
            value={target}
            onChangeText={(x) => setTarget(x.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
          />
          <Button
            label="Cho phép thông báo"
            selected={notifications}
            onPress={() => setNotifications(!notifications)}
          />
          {!!error && <Body>{error}</Body>}
          <Button label="Hủy" disabled={busy} onPress={onClose} />
          <Button
            label="Bắt đầu theo dõi"
            disabled={
              !onStart ||
              busy ||
              (!!target &&
                (!Number.isSafeInteger(Number(target)) || Number(target) <= 0))
            }
            onPress={async () => {
              if (!onStart || !candidateId || busy) return;
              setBusy(true);
              try {
                await onStart({
                  candidateId,
                  targetAmount: target ? Number(target) : null,
                  notificationsEnabled: notifications,
                });
                onClose();
              } catch {
                setError(
                  "Không thể bắt đầu theo dõi; trạng thái chưa thay đổi.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
