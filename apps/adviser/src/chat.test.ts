import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ChatController,
  commitProposal,
  type ChatReply,
  type ChatTransport,
} from "./chat";
import { createStore } from "./storage";
import { initialDraft, CATEGORY_PURPOSES, VALID_PRIORITIES } from "./model";
const draft = {
  ...initialDraft,
  budget: "20000000",
  purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
  priorities: [...VALID_PRIORITIES.slice(0, 3)],
};
const reply: ChatReply = {
  text: "Chưa có dữ liệu giá hoặc đo kiểm.",
  mode: "fallback",
  providerLabel: "Fixture — không phải AI live",
  sources: [],
};
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
test("CHAT-P01 empty and unavailable submits never invoke transport", async () => {
  let calls = 0;
  const c = new ChatController(async () => {
    calls++;
    return reply;
  });
  await c.send("   ", 0);
  assert.equal(calls, 0);
  const off = new ChatController();
  await off.send("Tìm máy", 0);
  assert.equal(off.snapshot().status, "unavailable");
  assert.equal(off.snapshot().messages.length, 0);
});
test("CHAT-P02 synchronous double-submit bounded to one in-flight request", async () => {
  const d = deferred<ChatReply>();
  let calls = 0;
  const c = new ChatController(async () => {
    calls++;
    return d.promise;
  });
  const first = c.send("Tìm máy", 0);
  await c.send("Tìm máy lần nữa", 0);
  assert.equal(calls, 1);
  d.resolve(reply);
  await first;
  assert.equal(c.snapshot().messages.length, 2);
  assert.equal(c.snapshot().messages[1].reply?.mode, "fallback");
});
test("CHAT-P03 cancel aborts and discards late response", async () => {
  const d = deferred<ChatReply>();
  let signal: AbortSignal;
  const c = new ChatController(async (_, s) => {
    signal = s;
    return d.promise;
  });
  const run = c.send("Tìm máy", 0);
  c.cancel();
  assert.ok(signal!.aborted);
  d.resolve(reply);
  await run;
  assert.equal(c.snapshot().status, "cancelled");
  assert.equal(c.snapshot().messages.length, 1);
});
test("CHAT-P04 revision change rejects late response and old proposal", async () => {
  const d = deferred<ChatReply>();
  const c = new ChatController(async () => d.promise);
  const run = c.send("Tìm máy", 1);
  c.revisionChanged(2);
  d.resolve({ ...reply, proposal: { draft, baseProfileRevision: 1 } });
  await run;
  assert.equal(c.snapshot().proposal, null);
  assert.equal(c.snapshot().messages.length, 1);
});
test("CHAT-P05 error/retry keeps a single user turn and sanitizes errors", async () => {
  let calls = 0;
  const c = new ChatController(async () => {
    if (!calls++) throw Error("secret-token");
    return reply;
  });
  await c.send("Tìm máy", 0);
  assert.equal(c.snapshot().status, "error");
  assert.ok(!c.snapshot().error.includes("secret"));
  await c.retry(0);
  assert.equal(c.snapshot().messages.length, 2);
  assert.equal(c.snapshot().status, "idle");
});
test("CHAT-P06 proposal review/cancel has no durable mutation", async () => {
  const c = new ChatController(async () => ({
    ...reply,
    proposal: { draft, baseProfileRevision: 0 },
  }));
  await c.send("Nhu cầu", 0);
  assert.equal(c.snapshot().reviewing, false);
  c.review();
  assert.equal(c.snapshot().reviewing, true);
  c.dismissProposal();
  assert.equal(c.snapshot().proposal, null);
});
test("CHAT-P07 confirm commits only after durable write; failure retains proposal/profile", async () => {
  let raw: string | null = null;
  let fail = true;
  const store = createStore({
    getItem: async () => raw,
    setItem: async (_, v) => {
      if (fail) throw Error("disk");
      raw = v;
    },
  });
  await store.load();
  const c = new ChatController(async () => ({
    ...reply,
    proposal: { draft, baseProfileRevision: 0 },
  }));
  await c.send("Nhu cầu", 0);
  c.review();
  const commit = (p: any) => commitProposal((fn) => store.update(fn), p);
  await c.confirm(commit);
  assert.equal(c.snapshot().status, "error");
  assert.ok(c.snapshot().proposal);
  assert.equal(raw, null);
  fail = false;
  await c.confirm(commit);
  assert.equal(c.snapshot().proposal, null);
  assert.equal(JSON.parse(raw!).revision, 1);
  assert.equal(JSON.parse(raw!).confirmed.budget.hardCeilingVnd, 20000000);
});
test("CHAT-P08 stale/invalid proposal rejected without write", async () => {
  let writes = 0;
  const store = createStore({
    getItem: async () => null,
    setItem: async () => {
      writes++;
    },
  });
  await store.load();
  await assert.rejects(
    commitProposal((fn) => store.update(fn), { draft, baseProfileRevision: 1 }),
  );
  await assert.rejects(
    commitProposal((fn) => store.update(fn), {
      draft: { ...draft, purposes: [] },
      baseProfileRevision: 0,
    }),
  );
  assert.equal(writes, 0);
});
test("CHAT-P09 timeout releases busy state even if transport ignores abort", async () => {
  const c = new ChatController(async () => new Promise(() => {}), 5);
  await c.send("Tìm máy", 0);
  assert.equal(c.snapshot().status, "error");
});
test("CHAT-P10 dispose suppresses notifications and pending replies", async () => {
  const d = deferred<ChatReply>();
  const c = new ChatController(async () => d.promise);
  let n = 0;
  c.subscribe(() => n++);
  const run = c.send("Tìm máy", 0);
  c.dispose();
  const before = n;
  d.resolve(reply);
  await run;
  assert.equal(n, before);
});

test("CHAT-P11 provider provenance retained; unsafe source rejected", async () => {
  const c = new ChatController(async () => ({
    ...reply,
    mode: "provider",
    providerLabel: "Controlled fixture provider",
    sources: [
      { label: "Source fixture", url: "https://example.com/reference" },
    ],
  }));
  await c.send("Evidence", 0);
  assert.equal(
    c.snapshot().messages[1].reply?.sources[0].label,
    "Source fixture",
  );
  const bad = new ChatController(async () => ({
    ...reply,
    sources: [{ label: "Unsafe", url: "javascript:alert(1)" }],
  }));
  await bad.send("Evidence", 0);
  assert.equal(bad.snapshot().status, "error");
  assert.equal(bad.snapshot().messages.length, 1);
});
test("CHAT-P12 retry does not duplicate user text in transport history", async () => {
  let calls = 0;
  const c = new ChatController(async (input) => {
    assert.equal(input.history.length, 0);
    if (!calls++) throw Error("fail");
    return reply;
  });
  await c.send("Need", 0);
  await c.retry(0);
  assert.equal(
    c.snapshot().messages.filter((x) => x.role === "user").length,
    1,
  );
});
test("CHAT-P13 duplicate confirmation performs one durable mutation", async () => {
  const d = deferred<void>();
  let writes = 0;
  const c = new ChatController(async () => ({
    ...reply,
    proposal: { draft, baseProfileRevision: 0 },
  }));
  await c.send("Need", 0);
  c.review();
  const commit = async () => {
    writes++;
    await d.promise;
  };
  const one = c.confirm(commit);
  await c.confirm(commit);
  assert.equal(writes, 1);
  d.resolve();
  await one;
  assert.equal(c.snapshot().proposal, null);
});

test("CHAT-P14 idle tab switch does not claim a completed request was cancelled", async () => {
  const c = new ChatController(async () => reply);
  await c.send("Need", 0);
  c.cancel();
  assert.equal(c.snapshot().status, "idle");
  assert.equal(c.snapshot().messages.length, 2);
});
