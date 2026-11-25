import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { explain, type ExplanationResponse } from "../api";
import { DEFAULT_API_ENDPOINT } from "../api/config";
import type { ConfirmedNeedsProfile } from "../model";
import { aiFallbackCopy } from "../domain/official";
import { recordError } from "../utils/error-logger";
import { Body, Button, Notice, s } from "../ui";
import { useTheme } from "../theme";
import { useLocale } from "../i18n";

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
  const { t } = useLocale();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExplanationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const prevVariant = useRef(variantId);

  useEffect(() => {
    if (prevVariant.current !== variantId) {
      prevVariant.current = variantId;
      setQuestion("");
    }
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
      recordError("network", "EXPLAIN_FAILED");
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
            offline
              ? "Đang bật chế độ chỉ xử lý AI ngoại tuyến"
              : !profile
                ? "Xác nhận nhu cầu trước khi hỏi AI"
                : "Dịch vụ tư vấn chưa khả dụng"
          }
        />
      )}
      <TextInput
        accessibilityLabel={t("Câu hỏi về cấu hình")}
        placeholder={t("Nhập câu hỏi về cấu hình này…")}
        placeholderTextColor={c.onSurfaceVariant}
        value={question}
        onChangeText={setQuestion}
        editable={enabled && !busy}
        maxLength={500}
        multiline
        style={[
          s.input,
          {
            color: c.onSurface,
            borderColor: c.outline,
            opacity: enabled ? 1 : 0.6,
          },
        ]}
      />
      <View style={{ ...s.row, justifyContent: "space-between" }}>
        <Button
          label="Hỏi AI"
          selected
          disabled={!enabled || busy || !question.trim()}
          onPress={() => void ask(question)}
        />
        <Body muted>{question.length}/500</Body>
      </View>
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
              setQuestion(t(q));
              void ask(t(q));
            }}
          />
        ))}
      </View>
      {busy && (
        <View style={s.row}>
          <ActivityIndicator color={c.primary} accessibilityLabel={t("Đang chờ phản hồi…")} />
          <Button
            label="Hủy hỏi AI"
            onPress={() => {
              ++sequence.current;
              active.current?.abort();
              setBusy(false);
            }}
          />
        </View>
      )}
      {error !== "" && <Notice live tone="error" title={error} />}
      {answer && (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          {answer.lines.map((line, i) => (
            <Body key={i}>{line}</Body>
          ))}
          <Body muted>
            {answer.isFallback
              ? `${t("Phản hồi dự phòng")} · ${t(aiFallbackCopy(answer.fallbackReason))}`
              : `${t("Nhà cung cấp")}: ${answer.provider}`}
          </Body>
        </View>
      )}
    </View>
  );
}
