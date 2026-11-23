import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { DEFAULT_API_ENDPOINT } from "../api/config";
import { Body, Button, Notice, Title, s } from "../ui";
import { useTheme } from "../theme";

type Progress = {
  state: string;
  running: boolean;
  updatedAt: string | null;
  batch: { claimedPages: number; maxPages: number } | null;
  totals: { kind: string; state: string; tasks: number }[];
  error: string | null;
};
const states: Record<string, string> = {
  idle: "Chưa có lượt cập nhật",
  running: "Đang lấy dữ liệu từ nhà bán lẻ",
  pausing: "Đang hoàn tất trang hiện tại và lưu tiến trình",
  publishing: "Đang cập nhật danh mục từ dữ liệu đã lấy",
  paused: "Đã lưu tiến trình",
  stopped: "Đã lưu tiến trình",
  finished_with_gaps: "Đã lưu tiến trình; một số nguồn gặp lỗi",
  exhausted: "Đã xử lý hết hàng đợi",
  failed: "Lượt cập nhật gặp lỗi; tiến trình đã lưu được giữ lại",
};

export function CrawlPanel() {
  const { c } = useTheme();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const load = useCallback(async (action?: "resume" | "pause") => {
    const ticket = ++current.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    if (action) setBusy(true);
    try {
      const response = await fetch(DEFAULT_API_ENDPOINT + "/advisor/v1/crawl", {
        method: action ? "POST" : "GET",
        signal: controller.signal,
        ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) } : {}),
      });
      const data = await response.json();
      if (!response.ok || typeof data.running !== "boolean" || !Array.isArray(data.totals)) throw Error("CRAWL_UNAVAILABLE");
      if (ticket === current.current) { setProgress(data); setError(""); }
    } catch {
      if (ticket === current.current) setError("Không đọc được tiến trình cập nhật. Kiểm tra kết nối máy chủ rồi thử lại.");
    } finally {
      clearTimeout(timeout);
      if (ticket === current.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => { current.current++; abort.current?.abort(); };
  }, [load]);
  useEffect(() => {
    if (!progress?.running || busy || error) return;
    const timer = setTimeout(() => void load(), 2000);
    return () => clearTimeout(timer);
  }, [progress, busy, error, load]);
  const done = progress?.totals.filter(row => row.state === "done").reduce((sum, row) => sum + row.tasks, 0) ?? 0;
  const pending = progress?.totals.filter(row => ["pending", "running"].includes(row.state)).reduce((sum, row) => sum + row.tasks, 0) ?? 0;
  return (
    <View style={s.section}>
      <Title small>Cập nhật dữ liệu</Title>
      <Body>Chỉ lấy dữ liệu khi bạn bấm cập nhật hoặc đến lịch 02:00 hằng ngày, giờ Việt Nam. Mỗi lượt tối đa 50 trang.</Body>
      <Body muted>Tiến trình được lưu trên máy chủ. Lượt sau tiếp tục các URL còn chờ; dữ liệu đã lưu vẫn dùng được khi tạm dừng.</Body>
      {!progress && !error && <ActivityIndicator accessibilityLabel="Đang đọc tiến trình cập nhật" color={c.primary} />}
      {progress && <>
        <Body>{states[progress.state] ?? "Đã lưu tiến trình"}</Body>
        <Body muted>{done} URL đã xong · {pending} URL còn chờ</Body>
        {progress.running && progress.batch && <Body muted>Lượt này: {progress.batch.claimedPages}/{progress.batch.maxPages} trang</Body>}
        {!!progress.error && <Body muted>Máy chủ chưa hoàn tất lượt cập nhật. Bạn có thể xem tiến độ hoặc tiếp tục.</Body>}
      </>}
      {!!error && <Notice title={error} />}
      <View style={s.row}>
        <Button label="Cập nhật thêm 50 trang" disabled={busy || !progress || progress.running || !!error} onPress={() => void load("resume")} />
        {progress?.running && <Button label="Tạm dừng và lưu" disabled={busy || progress.state === "pausing"} onPress={() => void load("pause")} />}
        <Button quiet label="Xem tiến độ" disabled={busy} onPress={() => void load()} />
      </View>
    </View>
  );
}
