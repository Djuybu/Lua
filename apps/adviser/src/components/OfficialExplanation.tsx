import React, { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { explain, type ExplanationResponse } from "../api";
import { DEFAULT_API_ENDPOINT } from "../api/config";
import type { ConfirmedNeedsProfile } from "../model";
import { aiFallbackCopy } from "../domain/official";
import { Body, Button, Notice, s } from "../ui";
import { useTheme } from "../theme";
export function OfficialExplanation({
  variantId,
  profile,
  revision,
  offline,
  endpoint = DEFAULT_API_ENDPOINT,
}: {
  variantId: string;
  profile: ConfirmedNeedsProfile | null;
  revision: number;
  offline: boolean;
  endpoint?: string;
}) {
  const { c } = useTheme();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExplanationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    ++sequence.current;
    active.current?.abort();
    setBusy(false);
    setAnswer(null);
    setError("");
    return () => {
      ++sequence.current;
      active.current?.abort();
    };
  }, [variantId, profile, revision, offline, endpoint]);
  async function ask(text: string) {
    if (!profile || offline || !endpoint || busy || !text.trim()) return;
    const id = ++sequence.current;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setAnswer(null);
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const reply = await explain(
        endpoint,
        variantId,
        profile,
        String(id),
        text,
        controller.signal,
      );
      if (sequence.current === id && !controller.signal.aborted)
        setAnswer(reply);
    } catch {
      if (sequence.current === id)
        setError("Không tải được tư vấn. Bạn có thể thử lại.");
    } finally {
      clearTimeout(timer);
      if (sequence.current === id) setBusy(false);
    }
  }
  const enabled = !!profile && !offline && !!endpoint;
  return (
    <View style={{ gap: 12 }}>
      <Body>Tư vấn về cấu hình này</Body>
      {!enabled && (
        <Notice
          title={
            !profile
              ? "Xác nhận nhu cầu trước khi hỏi AI"
              : "Dịch vụ tư vấn chưa khả dụng"
          }
        />
      )}
      <TextInput
        accessibilityLabel="Câu hỏi về cấu hình"
        value={question}
        onChangeText={setQuestion}
        maxLength={500}
        multiline
        style={[s.input, { color: c.onSurface, borderColor: c.outline }]}
      />
      <Button
        label="Hỏi AI"
        disabled={!enabled || busy || !question.trim()}
        onPress={() => void ask(question)}
      />
      <View style={s.row}>
        {[
          "Có phù hợp ngân sách không?",
          "Thông số nổi bật là gì?",
          "Có phù hợp ưu tiên của tôi không?",
        ].map((q) => (
          <Button
            key={q}
            label={q}
            disabled={!enabled || busy}
            onPress={() => {
              setQuestion(q);
              void ask(q);
            }}
          />
        ))}
      </View>
      {busy && (
        <Button
          label="Hủy hỏi AI"
          onPress={() => {
            ++sequence.current;
            active.current?.abort();
            setBusy(false);
          }}
        />
      )}
      {error !== "" && <Notice title={error} />}
      {answer && (
        <View accessibilityLiveRegion="polite">
          {answer.lines.map((line, i) => (
            <Body key={i}>{line}</Body>
          ))}
          <Body muted>
            {answer.isFallback
              ? "Phản hồi dự phòng · " + aiFallbackCopy(answer.fallbackReason)
              : "Nhà cung cấp: " + answer.provider}
          </Body>
        </View>
      )}
    </View>
  );
}
