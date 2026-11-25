import type { ChatReply, ChatTransport } from "../chat";
import { safeEndpoint } from "../model";
import { parseJsonSafe } from "../api";

export function createHttpChatTransport(endpoint: string): ChatTransport {
  if (!safeEndpoint(endpoint)) throw new Error("INVALID_CHAT_ENDPOINT");
  const url = endpoint.replace(/\/+$/, "") + "/advisor/v1/chat";
  return async (input, signal): Promise<ChatReply> => {
    const capped = input.history
      .slice(-20)
      .map(({ role, text }) => ({ role, text: text.slice(0, 4000) }));
    // Keep total serialized payload well within server limits even for multi-byte UTF-8.
    const history: typeof capped = [];
    let totalChars = input.text.length;
    for (let i = capped.length - 1; i >= 0; i--) {
      const entry = capped[i];
      if (totalChars + entry.text.length > 12000) break;
      history.unshift(entry);
      totalChars += entry.text.length;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        text: input.text,
        profileRevision: input.profileRevision,
        history,
      }),
    });
    const data = await parseJsonSafe(response);
    if (!response.ok || !data)
      throw new Error(data?.error?.message ?? "CHAT_UNAVAILABLE");
    return data as ChatReply;
  };
}

