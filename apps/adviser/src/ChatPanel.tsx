import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "./theme";
import { useLocale } from "./i18n";
import { Body, Button, Chip, Notice, Title, s } from "./ui";
import { categories, labels, vnd } from "./model";
import { openExternalUrl } from "./utils/share";
import {
  ChatController,
  type ChatProposal,
  type ChatTransport,
} from "./chat";

const STARTER_PROMPTS = [
  "Tìm laptop lập trình dưới 25 triệu, RAM 16GB",
  "Tư vấn laptop học tập văn phòng mỏng nhẹ dưới 18 triệu",
  "So sánh máy có đồ họa rời dưới 30 triệu",
];

export function ChatPanel({
  transport,
  initialPrompt,
  revision,
  active = true,
  canCommit = true,
  onConfirm,
  onClose,
}: {
  transport?: ChatTransport;
  initialPrompt?: string;
  revision: number;
  active?: boolean;
  canCommit?: boolean;
  onConfirm: (proposal: ChatProposal) => Promise<void>;
  onClose?: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLocale();
  const controller = useMemo(() => new ChatController(transport), [transport]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [text, setText] = useState("");
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const previous = useRef(state.status);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active && !wasActive.current && initialPrompt?.trim() && !text.trim()) {
      setText(initialPrompt);
    }
    wasActive.current = active;
  }, [active, initialPrompt, text]);

  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    controller.revisionChanged(revision);
  }, [controller, revision]);
  useEffect(() => {
    if (!active) controller.cancelInFlight();
  }, [controller, active]);
  useEffect(() => {
    if (active && previous.current === "sending" && state.status !== "sending")
      input.current?.focus();
    previous.current = state.status;
  }, [state.status, active]);
  useEffect(() => {
    if (active && state.messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 30);
    }
  }, [active, state.messages.length, state.reviewing]);

  const busy = state.status === "sending" || state.status === "applying";
  const unavailable = !transport;
  function send(override?: string) {
    const raw = override ?? text;
    if (!raw.trim() || busy || unavailable) return;
    if (!override) setText("");
    void controller.send(raw, revision);
  }
  const proposal = state.proposal;

  return (
    <View
      style={{ flex: 1 }}
      accessibilityLabel={t("Hội thoại tư vấn")}
    >
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderColor: c.outlineVariant,
          maxWidth: 800,
          width: "100%",
          alignSelf: "center",
          gap: 6,
        }}
      >
        <View style={{ ...s.row, justifyContent: "space-between" }}>
          <Title small>Trao đổi về nhu cầu</Title>
          <View style={s.row}>
            {state.messages.length > 0 && (
              <Button
                quiet
                label="Xóa hội thoại"
                disabled={busy}
                onPress={() => controller.clearConversation()}
              />
            )}
            {onClose && (
              <Button quiet label="Đóng" onPress={onClose} />
            )}
          </View>
        </View>
        <Body muted>
          Lịch sử chỉ giữ trong phiên này. Đề xuất không tự thay đổi nhu cầu đã
          xác nhận.
        </Body>
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          gap: 14,
          maxWidth: 800,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {unavailable && (
          <Notice title="Chatbot chưa khả dụng">
            Chưa kết nối dịch vụ hội thoại. Bạn vẫn có thể nhập nhu cầu bằng
            biểu mẫu; không có yêu cầu chat nào được gửi.
          </Notice>
        )}
        <Notice title="Giới hạn dữ liệu">
          Chatbot tra cứu danh mục thiết bị trực tuyến. Kết quả chưa xác nhận
          hiệu năng khi chưa có đo kiểm độc lập; giá chính thức luôn gắn với
          đúng cấu hình và nguồn dữ liệu.
        </Notice>

        {!unavailable && state.messages.length === 0 && (
          <View style={{ gap: 8 }}>
            <Body muted>Gợi ý bắt đầu nhanh:</Body>
            <View style={s.row}>
              {STARTER_PROMPTS.map((prompt) => (
                <Chip
                  key={prompt}
                  label={prompt}
                  tone="primary"
                  onPress={() => send(prompt)}
                />
              ))}
            </View>
          </View>
        )}

        {state.messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <View
              key={`${message.role}-${message.id}`}
              style={{
                alignSelf: isUser ? "flex-end" : "flex-start",
                maxWidth: isUser ? "82%" : "90%",
                backgroundColor: isUser
                  ? c.primaryContainer
                  : c.surfaceContainer,
                borderRadius: 18,
                padding: 16,
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: isUser ? c.onPrimaryContainer : c.onSurfaceVariant,
                }}
              >
                {isUser
                  ? t("Bạn")
                  : message.reply?.mode === "fallback"
                    ? t("Phản hồi dự phòng")
                    : t("Phản hồi từ nhà cung cấp")}
              </Text>
              <Text
                selectable
                style={{
                  fontSize: 16,
                  lineHeight: 24,
                  color: isUser ? c.onPrimaryContainer : c.onSurface,
                }}
              >
                {message.text}
              </Text>
              {message.reply && (
                <>
                  <Body muted>
                    {message.reply.providerLabel} ·{" "}
                    {message.reply.mode === "fallback"
                      ? t("Fallback — không phải kết quả AI live")
                      : t("Nội dung cần đối chiếu nguồn")}
                  </Body>
                  {message.reply.sources.length ? (
                    message.reply.sources.map((source, i) => (
                      <Button
                        key={i}
                        quiet
                        label={`${t("Nguồn")}: ${source.label}`}
                        onPress={() => void openExternalUrl(source.url)}
                      />
                    ))
                  ) : (
                    <Body muted>
                      Chưa có nguồn chứng cứ kèm phản hồi. Không dùng nội dung
                      này làm xác nhận mua hàng.
                    </Body>
                  )}
                </>
              )}
            </View>
          );
        })}

        <View accessibilityLiveRegion="polite" style={{ gap: 10 }}>
          {state.status === "sending" && (
            <View style={s.row}>
              <ActivityIndicator
                color={c.primary}
                accessibilityLabel={t("Đang gửi hội thoại")}
              />
              <Body>Đang chờ phản hồi…</Body>
              <Button label="Hủy gửi" onPress={() => controller.cancel()} />
            </View>
          )}
          {state.status === "cancelled" && (
            <Body muted>
              Đã hủy yêu cầu. Phản hồi đến muộn sẽ được bỏ qua.
            </Body>
          )}
          {state.error !== "" && <Notice live tone="error" title={state.error} />}
        </View>

        {state.status === "error" && !state.proposal && (
          <Button
            label="Thử gửi lại"
            disabled={busy || unavailable}
            onPress={() => {
              void controller.retry(revision);
            }}
          />
        )}
        {proposal && !state.reviewing && (
          <Button
            label="Xem lại đề xuất nhu cầu"
            selected
            onPress={() => controller.review()}
          />
        )}
        {proposal && state.reviewing && (
          <View
            style={{
              gap: 12,
              padding: 18,
              borderRadius: 16,
              backgroundColor: c.surfaceContainer,
            }}
          >
            <Title small>Xem lại đề xuất</Title>
            <Body>
              Nhu cầu đang dùng chưa thay đổi. Xác nhận chỉ hoàn tất sau khi lưu
              thành công.
            </Body>
            <Body>
              {t(categories[proposal.draft.category])} · {t("Trần")}{" "}
              {vnd(Number(proposal.draft.budget), t("Chưa xác định"))}
            </Body>
            <Body>
              {t("Mục đích theo thứ tự")}:{" "}
              {proposal.draft.purposes.map((x) => t(labels[x])).join(" → ")}
            </Body>
            <Body>
              {t("Ưu tiên theo thứ tự")}:{" "}
              {proposal.draft.priorities.map((x) => t(labels[x])).join(" → ")}
            </Body>
            <Body>
              {t("RAM tối thiểu")}:{" "}
              {proposal.draft.minRam
                ? `${proposal.draft.minRam} GB`
                : t("Chưa yêu cầu")}{" "}
              · OS: {proposal.draft.os || t("Chưa yêu cầu")}
            </Body>
            <View style={s.row}>
              <Button
                label="Hủy đề xuất"
                disabled={busy}
                onPress={() => controller.dismissProposal()}
              />
              <Button
                label={
                  state.status === "applying"
                    ? "Đang lưu đề xuất…"
                    : "Xác nhận đề xuất"
                }
                disabled={busy || !canCommit}
                selected
                onPress={() => {
                  void controller.confirm(onConfirm);
                }}
              />
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: c.surfaceContainer,
          borderTopWidth: 1,
          borderColor: c.outlineVariant,
        }}
      >
        <View
          style={{
            maxWidth: 800,
            width: "100%",
            alignSelf: "center",
            gap: 8,
          }}
        >
          <TextInput
            ref={input}
            accessibilityLabel={t("Tin nhắn tư vấn")}
            multiline
            maxLength={4000}
            value={text}
            onChangeText={setText}
            editable={!busy}
            placeholder={t("Bạn cần thiết bị cho công việc gì?")}
            placeholderTextColor={c.onSurfaceVariant}
            style={[
              s.input,
              {
                color: c.onSurface,
                borderColor: c.outline,
                backgroundColor: c.surface,
                minHeight: 72,
                maxHeight: 140,
                textAlignVertical: "top",
              },
            ]}
          />
          <View style={{ ...s.row, justifyContent: "space-between" }}>
            <Body muted>{text.length}/4000</Body>
            <Button
              label="Gửi tin nhắn"
              selected
              disabled={unavailable || busy || !text.trim()}
              onPress={() => send()}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
