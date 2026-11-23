import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpChatTransport } from "./api/chat";

test("HTTP chat transport posts bounded conversation to configured backend", async () => {
  const original = globalThis.fetch;
  let request: { url: string; body: any } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    request = { url: String(url), body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({
      text: "Phản hồi có căn cứ.",
      mode: "provider",
      providerLabel: "OpenAI · test",
      sources: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const transport = createHttpChatTransport("http://127.0.0.1:8080/");
    const reply = await transport({ text: "Laptop lập trình", history: [], profileRevision: 3 }, new AbortController().signal);
    assert.equal(request?.url, "http://127.0.0.1:8080/advisor/v1/chat");
    assert.deepEqual(request?.body, { text: "Laptop lập trình", history: [], profileRevision: 3 });
    assert.equal(reply.mode, "provider");
  } finally {
    globalThis.fetch = original;
  }
});

test("HTTP chat transport rejects unsafe endpoints", () => {
  assert.throws(() => createHttpChatTransport("http://example.com"), /INVALID_CHAT_ENDPOINT/);
});

