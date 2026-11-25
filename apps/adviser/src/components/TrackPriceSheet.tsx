import React, { useEffect, useState } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";
import { vnd } from "../model";
import { Body, Button, Notice, Title, s } from "../ui";

export type TrackingRequest = {
  candidateId: string;
  targetAmount: number | null;
  notificationsEnabled: boolean;
};

export function TrackPriceSheet({
  candidateId,
  initialTargetAmount = null,
  initialNotifications = false,
  onClose,
  onStart,
}: {
  candidateId: string | null;
  initialTargetAmount?: number | null;
  initialNotifications?: boolean;
  onClose: () => void;
  onStart?: (r: TrackingRequest) => Promise<void>;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const [target, setTarget] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (candidateId) {
      setTarget(
        initialTargetAmount != null ? String(initialTargetAmount) : "",
      );
      setNotifications(initialNotifications);
      setError("");
    }
  }, [candidateId, initialTargetAmount, initialNotifications]);

  const invalidTarget =
    !!target && (!Number.isSafeInteger(Number(target)) || Number(target) <= 0);

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
        <View style={[s.card, { backgroundColor: c.surface, maxWidth: 480, width: "100%", alignSelf: "center" }]}>
          <Title small>Theo dõi giá</Title>
          <Body muted>Đặt ngưỡng giá mong muốn để ghi nhận quy tắc theo dõi trên thiết bị.</Body>
          {!onStart && (
            <Notice title="Chưa có hợp đồng kết nối dịch vụ theo dõi giá." />
          )}
          <TextInput
            accessibilityLabel={t("Giá mong muốn")}
            placeholder={t("Giá mong muốn")}
            placeholderTextColor={c.onSurfaceVariant}
            maxLength={12}
            value={target}
            onChangeText={(x) => {
              setError("");
              setTarget(x.replace(/[^0-9]/g, ""));
            }}
            keyboardType="number-pad"
            style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
          />
          {!!target && !invalidTarget && (
            <Body muted>{vnd(Number(target), "")}</Body>
          )}
          <Button
            label="Cho phép thông báo"
            selected={notifications}
            onPress={() => setNotifications(!notifications)}
          />
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={{ color: c.error, fontSize: 15, fontWeight: "600" }}
            >
              {t(error)}
            </Text>
          )}
          <View style={s.row}>
            <Button label="Hủy" disabled={busy} onPress={onClose} />
            <Button
              label="Bắt đầu theo dõi"
              selected
              disabled={!onStart || busy || invalidTarget}
              onPress={async () => {
                if (!onStart || !candidateId || busy) return;
                setBusy(true);
                setError("");
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
      </View>
    </Modal>
  );
}
