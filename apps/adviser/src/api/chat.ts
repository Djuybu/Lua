import type { ChatReply, ChatTransport } from "../chat";
import { safeEndpoint } from "../model";

export function createHttpChatTransport(endpoint: string): ChatTransport {
  if (!safeEndpoint(endpoint)) throw new Error("INVALID_CHAT_ENDPOINT");
  const url = endpoint.replace(/\/$/, "") + "/advisor/v1/chat";
  return async (input, signal): Promise<ChatReply> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        text: input.text,
        profileRevision: input.profileRevision,
        history: input.history.slice(-20).map(({ role, text }) => ({ role, text })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? "CHAT_UNAVAILABLE");
    return data as ChatReply;
  };
}

