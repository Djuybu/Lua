import React, { useState } from "react";
import { TextInput, View, Share } from "react-native";
import { useTheme, type Preferences } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Title, Notice, s } from "../ui";
import { diagnosticReport } from "../utils/error-logger";
import { CrawlPanel } from "../components/CrawlPanel";
export function SettingsScreen({
  preferences,
  pending,
  configured,
  onChange,
  onExport,
  onDelete,
}: {
  preferences: Preferences;
  pending: boolean;
  configured: boolean;
  onChange: (p: Partial<Preferences>) => Promise<void>;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { c, fallback } = useTheme();
  const { t } = useLocale();
  const [seed, setSeed] = useState(preferences.seed);
  const [description, setDescription] = useState("");
  const [showLog, setShowLog] = useState(false);
  return (
    <View style={s.section}>
      <Title>Cài đặt</Title>
      <CrawlPanel />
      <View
        style={{
          backgroundColor: c.surfaceContainerLow,
          padding: 20,
          borderRadius: 20,
          gap: 16,
        }}
      >
        <Title small>Giao diện</Title>
        <View style={s.row}>
          {(["system", "light", "dark"] as const).map((id, i) => (
            <Button
              key={id}
              label={["Theo thiết bị", "Sáng", "Tối"][i]}
              selected={preferences.appearance === id}
              disabled={pending}
              onPress={() => void onChange({ appearance: id })}
            />
          ))}
        </View>
        <Title small>Bảng màu Material You</Title>
        <Button
          label="Dùng màu của thiết bị"
          selected={preferences.dynamic}
          disabled={pending}
          onPress={() => void onChange({ dynamic: !preferences.dynamic })}
        />
        <View style={s.row}>
          {[
            "#6750A4",
            "#0061A4",
            "#984061",
            "#825500",
            "#006A67",
            "#545E71",
          ].map((x) => (
            <Button
              key={x}
              label={x}
              selected={!preferences.dynamic && preferences.seed === x}
              disabled={pending}
              onPress={() => void onChange({ seed: x, dynamic: false })}
            />
          ))}
        </View>
        <TextInput
          accessibilityLabel={t("Mã màu tùy chỉnh")}
          value={seed}
          onChangeText={setSeed}
          autoCapitalize="none"
          maxLength={7}
          style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
        />
        <Button
          label="Áp dụng màu tùy chỉnh"
          disabled={pending || !/^#[0-9a-f]{6}$/i.test(seed)}
          onPress={() => void onChange({ seed, dynamic: false })}
        />
        {fallback && <Notice title="Đã dùng bảng màu dự phòng" />}
        <Title small>Chuyển động</Title>
        <View style={s.row}>
          {(["system", "reduced"] as const).map((id, i) => (
            <Button
              key={id}
              label={["Theo hệ thống", "Giảm chuyển động"][i]}
              selected={(preferences.motion ?? "system") === id}
              onPress={() => void onChange({ motion: id })}
            />
          ))}
        </View>
      </View>
      <Title small>Ngôn ngữ</Title>
      <View style={s.row}>
        <Button
          label="Tiếng Việt"
          selected={(preferences.locale ?? "vi") === "vi"}
          onPress={() => void onChange({ locale: "vi" })}
        />
        <Button
          label="English"
          selected={preferences.locale === "en"}
          onPress={() => void onChange({ locale: "en" })}
        />
      </View>
      <Title small>Quyền riêng tư & AI</Title>
      <Body>
        {configured
          ? "Tư vấn AI qua máy chủ. Nếu nhà cung cấp lỗi, ứng dụng hiển thị phản hồi dự phòng."
          : "AI chưa được cấu hình trong bản build này."}
      </Body>
      <Body muted>Khi gửi tin nhắn, nội dung hội thoại được gửi đến máy chủ và nhà cung cấp AI. API key chỉ lưu trên máy chủ.</Body>
      <Button
        label="Chỉ xử lý AI ngoại tuyến"
        selected={!!preferences.offlineAiOnly}
        onPress={() =>
          void onChange({ offlineAiOnly: !preferences.offlineAiOnly })
        }
      />
      <Body muted>
        {preferences.offlineAiOnly
          ? "Chưa có mô hình AI trên thiết bị; biểu mẫu và catalog vẫn hoạt động."
          : ""}
      </Body>
      <Body>Dữ liệu được lưu trên thiết bị này.</Body>
      <Button label="Sao lưu dữ liệu JSON" onPress={onExport} />
      <Button label="Xóa lịch sử giỏ hàng" onPress={onDelete} />
      <Title small>Báo lỗi cho nhà phát triển</Title>
      <TextInput
        accessibilityLabel={t("Mô tả sự cố")}
        placeholder={t("Mô tả sự cố")}
        placeholderTextColor={c.onSurfaceVariant}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2000}
        style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
      />
      <Button label="Xem nhật ký lỗi" onPress={() => setShowLog(!showLog)} />
      {showLog && <Body>{JSON.stringify(diagnosticReport(), null, 2)}</Body>}
      <Button
        label="Chia sẻ báo cáo lỗi"
        onPress={() =>
          void Share.share({
            message: JSON.stringify(
              { ...diagnosticReport(), userDescription: description },
              null,
              2,
            ),
          })
        }
      />
    </View>
  );
}
