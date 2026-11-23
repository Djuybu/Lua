import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  Linking,
  Text,
  TextInput,
  View,
} from "react-native";
import { Body, Button, Notice, Title, s } from "./ui";
import { useTheme } from "./theme";
import { categories, labels, vnd } from "./model";
import { ChatController, type ChatTransport, type ChatProposal } from "./chat";
export type ChatPanelProps = {
  transport?: ChatTransport;
  initialPrompt?: string;
  revision: number;
  active: boolean;
  canCommit: boolean;
  onConfirm: (proposal: ChatProposal) => Promise<unknown>;
};
export function ChatPanel({
  transport,
  initialPrompt,
  revision,
  active,
  canCommit,
  onConfirm,
}: ChatPanelProps) {
  const { c } = useTheme();
  const controller = useMemo(() => new ChatController(transport), [transport]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [text, setText] = useState("");
  useEffect(() => {
    if (initialPrompt !== undefined) setText(initialPrompt);
  }, [initialPrompt]);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const previous = useRef(state.status);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    controller.revisionChanged(revision);
  }, [controller, revision]);
  useEffect(() => {
    if (!active) controller.cancel();
  }, [controller, active]);
  useEffect(() => {
    if (active && previous.current === "sending" && state.status !== "sending")
      input.current?.focus();
    previous.current = state.status;
  }, [state.status, active]);
  const busy = state.status === "sending" || state.status === "applying";
  const unavailable = !transport;
  function send() {
    if (!text.trim() || busy || unavailable) return;
    const value = text;
    setText("");
    void controller.send(value, revision);
  }
  const proposal = state.proposal;
  return (
    <View style={s.section} accessibilityLabel="Hội thoại tư vấn">
      <Title small>Trao đổi về nhu cầu</Title>
      <Body muted>
        Lịch sử chỉ giữ trong phiên này. Đề xuất không tự thay đổi nhu cầu đã
        xác nhận.
      </Body>
      {unavailable && (
        <Notice title="Chatbot chưa khả dụng">
          Chưa kết nối dịch vụ hội thoại. Bạn vẫn có thể nhập nhu cầu bằng biểu
          mẫu; không có yêu cầu chat nào được gửi.
        </Notice>
      )}
      <Notice title="Giới hạn dữ liệu">
        Catalog được tải từ máy chủ, chưa có chào bán hoặc bằng chứng hiệu
        năng được duyệt. Chat không xác nhận giá trọn gói hay độ phù hợp từ dữ
        liệu còn thiếu.
      </Notice>
      {state.messages.map((message) => (
        <View
          key={`${message.role}-${message.id}`}
          style={{
            backgroundColor:
              message.role === "user" ? c.primaryContainer : c.surfaceContainer,
            borderRadius: 16,
            padding: 18,
            gap: 10,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color:
                message.role === "user" ? c.onPrimaryContainer : c.onSurface,
            }}
          >
            {message.role === "user"
              ? "Bạn"
              : message.reply?.mode === "fallback"
                ? "Phản hồi dự phòng"
                : "Phản hồi từ nhà cung cấp"}
          </Text>
          <Text
            selectable
            style={{
              fontSize: 16,
              lineHeight: 24,
              color:
                message.role === "user" ? c.onPrimaryContainer : c.onSurface,
            }}
          >
            {message.text}
          </Text>
          {message.reply && (
            <>
              <Body muted>
                {message.reply.providerLabel} ·{" "}
                {message.reply.mode === "fallback"
                  ? "Fallback — không phải kết quả AI live"
                  : "Nội dung cần đối chiếu nguồn"}
              </Body>
              {message.reply.sources.length ? (
                message.reply.sources.map((source, i) => (
                  <Button
                    key={i}
                    quiet
                    label={`Nguồn: ${source.label}`}
                    onPress={() => Linking.openURL(source.url)}
                  />
                ))
              ) : (
                <Body muted>
                  Chưa có nguồn chứng cứ kèm phản hồi. Không dùng nội dung này
                  làm xác nhận mua hàng.
                </Body>
              )}
            </>
          )}
        </View>
      ))}
      <View accessibilityLiveRegion="polite">
        {state.status === "sending" && (
          <View style={s.row}>
            <ActivityIndicator
              color={c.primary}
              accessibilityLabel="Đang gửi hội thoại"
            />
            <Body>Đang chờ phản hồi…</Body>
            <Button label="Hủy gửi" onPress={() => controller.cancel()} />
          </View>
        )}
        {state.status === "cancelled" && (
          <Body muted>Đã hủy yêu cầu. Phản hồi đến muộn sẽ được bỏ qua.</Body>
        )}
        {state.error !== "" && <Notice title={state.error} />}
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
          onPress={() => controller.review()}
        />
      )}
      {proposal && state.reviewing && (
        <View
          style={{
            gap: 14,
            padding: 20,
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
            {categories[proposal.draft.category]} · Trần{" "}
            {vnd(Number(proposal.draft.budget))}
          </Body>
          <Body>
            Mục đích theo thứ tự:{" "}
            {proposal.draft.purposes.map((x) => labels[x]).join(" → ")}
          </Body>
          <Body>
            Ưu tiên theo thứ tự:{" "}
            {proposal.draft.priorities.map((x) => labels[x]).join(" → ")}
          </Body>
          <Body>
            RAM tối thiểu: {proposal.draft.minRam || "Chưa yêu cầu"} · OS:{" "}
            {proposal.draft.os || "Chưa yêu cầu"}
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
      <TextInput
        ref={input}
        accessibilityLabel="Tin nhắn tư vấn"
        multiline
        maxLength={4000}
        value={text}
        onChangeText={setText}
        editable={!busy}
        placeholder="Bạn cần thiết bị cho công việc gì?"
        placeholderTextColor={c.onSurfaceVariant}
        style={[
          s.input,
          {
            color: c.onSurface,
            borderColor: c.outline,
            backgroundColor: c.surface,
            minHeight: 96,
            textAlignVertical: "top",
          },
        ]}
      />
      <View style={s.row}>
        <Button
          label="Gửi tin nhắn"
          disabled={unavailable || busy || !text.trim()}
          onPress={send}
        />
        <Body muted>{text.length}/4000</Body>
      </View>
    </View>
  );
}
