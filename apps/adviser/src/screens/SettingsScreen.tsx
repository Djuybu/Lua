import React, { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useTheme, type Preferences } from "../theme";
import { useLocale } from "../i18n";
import { Body, Button, Notice, SectionCard, Title, s } from "../ui";
import { diagnosticReport } from "../utils/error-logger";
import { shareOrDownloadJson } from "../utils/share";
import { CrawlPanel } from "../components/CrawlPanel";

const PRESET_COLORS = [
  ["#6750A4", "Tím mặc định"],
  ["#0061A4", "Xanh dương"],
  ["#984061", "Hồng mận"],
  ["#825500", "Hổ phách"],
  ["#006A67", "Xanh ngọc"],
  ["#545E71", "Xám đá"],
] as const;

export function SettingsScreen({
  preferences,
  pending,
  configured,
  endpoint = "",
  onChange,
  onExport,
  onDelete,
  onCatalogRefresh,
}: {
  preferences: Preferences;
  pending: boolean;
  configured: boolean;
  endpoint?: string;
  onChange: (p: Partial<Preferences>) => Promise<void>;
  onExport: () => void;
  onDelete: () => void;
  onCatalogRefresh?: () => void;
}) {
  const { c, fallback } = useTheme();
  const { t } = useLocale();
  const [seed, setSeed] = useState(preferences.seed);
  const [description, setDescription] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [reportNotice, setReportNotice] = useState("");
  const [crawlOpen, setCrawlOpen] = useState(
    !preferences.offlineAiOnly && !!endpoint,
  );

  useEffect(() => {
    setSeed(preferences.seed);
  }, [preferences.seed]);

  useEffect(() => {
    if (preferences.offlineAiOnly) setCrawlOpen(false);
    else if (endpoint) setCrawlOpen(true);
  }, [preferences.offlineAiOnly, endpoint]);

  const normalizedSeed = preferences.seed.toLowerCase();

  return (
    <View style={s.section}>
      <Title>Cài đặt</Title>

      <SectionCard>
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
          {PRESET_COLORS.map(([hex, name]) => (
            <Button
              key={hex}
              label={name}
              a11yLabel={`${t(name)} (${hex})`}
              icon={
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: hex,
                    borderWidth: 1,
                    borderColor: c.outline,
                  }}
                />
              }
              selected={!preferences.dynamic && normalizedSeed === hex.toLowerCase()}
              disabled={pending}
              onPress={() => void onChange({ seed: hex, dynamic: false })}
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
        {fallback && <Notice live title="Đã dùng bảng màu dự phòng" />}
        <Title small>Chuyển động</Title>
        <View style={s.row}>
          {(["system", "reduced"] as const).map((id, i) => (
            <Button
              key={id}
              label={["Theo hệ thống", "Giảm chuyển động"][i]}
              selected={(preferences.motion ?? "system") === id}
              disabled={pending}
              onPress={() => void onChange({ motion: id })}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <Title small>Ngôn ngữ</Title>
        <View style={s.row}>
          <Button
            label="Tiếng Việt"
            selected={(preferences.locale ?? "vi") === "vi"}
            disabled={pending}
            onPress={() => void onChange({ locale: "vi" })}
          />
          <Button
            label="English"
            selected={preferences.locale === "en"}
            disabled={pending}
            onPress={() => void onChange({ locale: "en" })}
          />
        </View>
      </SectionCard>

      <SectionCard>
        <Title small>Quyền riêng tư & AI</Title>
        <Body>
          {configured
            ? "Tư vấn AI qua máy chủ. Nếu nhà cung cấp lỗi, ứng dụng hiển thị phản hồi dự phòng."
            : "AI chưa được cấu hình trong bản build này."}
        </Body>
        <Body muted>
          Khi gửi tin nhắn, nội dung hội thoại được gửi đến máy chủ và nhà cung
          cấp AI. API key chỉ lưu trên máy chủ.
        </Body>
        <Button
          label="Chỉ xử lý AI ngoại tuyến"
          selected={!!preferences.offlineAiOnly}
          disabled={pending}
          onPress={() =>
            void onChange({ offlineAiOnly: !preferences.offlineAiOnly })
          }
        />
        {!!preferences.offlineAiOnly && (
          <Body muted>
            Chưa có mô hình AI trên thiết bị; biểu mẫu và catalog vẫn hoạt động.
          </Body>
        )}
        <Body>Dữ liệu được lưu trên thiết bị này.</Body>
        <View style={s.row}>
          <Button
            label="Sao lưu dữ liệu JSON"
            disabled={pending}
            onPress={onExport}
          />
          <Button
            label="Xóa lịch sử giỏ hàng"
            variant="destructive"
            disabled={pending}
            onPress={onDelete}
          />
        </View>
      </SectionCard>

      <SectionCard>
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
        <View style={s.row}>
          <Button
            label={showLog ? "Ẩn nhật ký lỗi" : "Xem nhật ký lỗi"}
            onPress={() => setShowLog(!showLog)}
          />
          <Button
            label="Chia sẻ báo cáo lỗi"
            onPress={() => {
              const payload = JSON.stringify(
                { ...diagnosticReport(), userDescription: description },
                null,
                2,
              );
              void shareOrDownloadJson("lua-diagnostics.json", payload).then(
                (outcome) => {
                  setReportNotice(
                    outcome === "downloaded"
                      ? "Đã tải xuống báo cáo lỗi JSON."
                      : outcome === "copied"
                        ? "Đã sao chép báo cáo lỗi vào bộ nhớ tạm."
                        : outcome === "failed"
                          ? "Không thể chia sẻ báo cáo lỗi trên thiết bị này."
                          : "",
                  );
                },
              );
            }}
          />
        </View>
        {!!reportNotice && <Notice live title={reportNotice} />}
        {showLog && <Body>{JSON.stringify(diagnosticReport(), null, 2)}</Body>}
      </SectionCard>

      {!preferences.offlineAiOnly && (
        <SectionCard>
          <View style={{ ...s.row, justifyContent: "space-between" }}>
            <Title small>Quản trị dữ liệu</Title>
            <Button
              quiet
              label={crawlOpen ? "Thu gọn" : "Mở rộng"}
              onPress={() => setCrawlOpen(!crawlOpen)}
            />
          </View>
          {crawlOpen && (
            <CrawlPanel
              offline={!!preferences.offlineAiOnly}
              endpoint={endpoint}
              onCompleted={onCatalogRefresh}
            />
          )}
        </SectionCard>
      )}
    </View>
  );
}
