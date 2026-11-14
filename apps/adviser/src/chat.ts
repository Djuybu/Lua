import { recordError } from "./utils/error-logger";
import { draftErrors, profileOf, type Draft } from "./model";
import type { State } from "./storage";
/** UI view models only. Not an HTTP/Agent3 schema. No default transport. */
export type ChatProposal = { draft: Draft; baseProfileRevision: number };
export type ChatReply = {
  text: string;
  mode: "provider" | "fallback";
  providerLabel: string;
  sources: { label: string; url: string }[];
  proposal?: ChatProposal;
};
export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  reply?: ChatReply;
};
export type ChatTransport = (
  input: {
    text: string;
    history: readonly ChatMessage[];
    profileRevision: number;
  },
  signal: AbortSignal,
) => Promise<ChatReply>;
export type ChatState = {
  status:
    "idle" | "sending" | "applying" | "cancelled" | "error" | "unavailable";
  messages: ChatMessage[];
  error: string;
  proposal: ChatProposal | null;
  reviewing: boolean;
};
export async function commitProposal(
  update: (fn: (s: State) => State) => Promise<State>,
  proposal: ChatProposal,
) {
  if (draftErrors(proposal.draft).length) throw Error("INVALID_PROPOSAL");
  return update((s) => {
    if (s.revision !== proposal.baseProfileRevision)
      throw Error("STALE_PROPOSAL");
    return {
      ...s,
      confirmed: profileOf(proposal.draft),
      revision: s.revision + 1,
    };
  });
}
function checked(reply: ChatReply, revision: number): ChatReply {
  if (
    !reply ||
    typeof reply.text !== "string" ||
    !reply.text.trim() ||
    reply.text.length > 16000 ||
    !["provider", "fallback"].includes(reply.mode) ||
    typeof reply.providerLabel !== "string" ||
    !reply.providerLabel.trim() ||
    !Array.isArray(reply.sources) ||
    reply.sources.length > 20
  )
    throw Error("INVALID_REPLY");
  if (
    reply.sources.some((s) => {
      try {
        return (
          typeof s.label !== "string" || new URL(s.url).protocol !== "https:"
        );
      } catch {
        return true;
      }
    })
  )
    throw Error("INVALID_SOURCE");
  if (
    reply.proposal &&
    (reply.proposal.baseProfileRevision !== revision ||
      draftErrors(reply.proposal.draft).length)
  )
    throw Error("INVALID_PROPOSAL");
  return structuredClone(reply);
}
export class ChatController {
  private state: ChatState;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private revision = 0;
  private active: AbortController | null = null;
  private disposed = false;
  private lastText = "";
  private lastRevision = 0;
  private lastHistory: ChatMessage[] = [];
  constructor(
    private transport?: ChatTransport,
    private timeoutMs = 15000,
  ) {
    this.state = {
      status: transport ? "idle" : "unavailable",
      messages: [],
      error: "",
      proposal: null,
      reviewing: false,
    };
  }
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(p: Partial<ChatState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn();
  }
  async send(raw: string, revision: number, retrying = false) {
    if (
      this.disposed ||
      this.state.status === "sending" ||
      this.state.status === "applying"
    )
      return;
    const text = raw.trim();
    if (!text || text.length > 4000) return;
    if (!this.transport) {
      this.publish({ status: "unavailable" });
      return;
    }
    this.revision = revision;
    this.lastRevision = revision;
    this.lastText = text;
    const seq = ++this.sequence;
    const active = new AbortController();
    this.active = active;
    const prior = this.state.messages;
    if (!retrying) this.lastHistory = structuredClone(prior);
    this.publish({
      status: "sending",
      error: "",
      proposal: null,
      reviewing: false,
      messages: retrying
        ? prior
        : [...prior, { id: seq, role: "user" as const, text }].slice(-40),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: () => void = () => {};
    try {
      const cancelled = new Promise<never>((_, reject) => {
        abortListener = () => reject(Error("CANCELLED"));
        active.signal.addEventListener("abort", abortListener, { once: true });
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(Error("TIMEOUT"));
          active.abort();
        }, this.timeoutMs);
      });
      const reply = checked(
        await Promise.race([
          this.transport(
            {
              text,
              history: structuredClone(retrying ? this.lastHistory : prior),
              profileRevision: revision,
            },
            active.signal,
          ),
          timeout,
          cancelled,
        ]),
        revision,
      );
      if (seq !== this.sequence || revision !== this.revision || this.disposed)
        return;
      this.publish({
        status: "idle",
        messages: [
          ...this.state.messages,
          { id: seq, role: "assistant" as const, text: reply.text, reply },
        ].slice(-40),
        proposal: reply.proposal ?? null,
      });
    } catch {
      recordError("chat", "REPLY_FAILED");
      if (seq === this.sequence && !this.disposed)
        this.publish({
          status: "error",
          error:
            "Không nhận được phản hồi hợp lệ. Hãy thử lại; nhu cầu đã xác nhận được giữ nguyên.",
        });
    } finally {
      if (timer) clearTimeout(timer);
      active.signal.removeEventListener("abort", abortListener);
      if (this.active === active) this.active = null;
    }
  }
  retry(revision: number) {
    if (
      this.state.status !== "error" ||
      !this.lastText ||
      revision !== this.lastRevision
    )
      return Promise.resolve();
    return this.send(this.lastText, revision, true);
  }
  cancel() {
    if (
      this.state.status === "applying" ||
      (this.state.status !== "sending" && !this.state.proposal)
    )
      return;
    ++this.sequence;
    this.active?.abort();
    this.active = null;
    this.publish({
      status: this.transport ? "cancelled" : "unavailable",
      proposal: null,
      reviewing: false,
      error: "",
    });
  }
  revisionChanged(revision: number) {
    if (revision === this.revision) return;
    this.revision = revision;
    const wasActive = this.state.status === "sending" || !!this.state.proposal;
    this.cancel();
    this.publish({
      status: this.transport ? "idle" : "unavailable",
      proposal: null,
      reviewing: false,
      error: "",
    });
    if (wasActive)
      this.publish({
        error:
          "Nhu cầu đã thay đổi. Phản hồi và đề xuất cũ không được áp dụng.",
      });
  }
  review() {
    if (this.state.proposal) this.publish({ reviewing: true, error: "" });
  }
  dismissProposal() {
    if (this.state.status !== "applying")
      this.publish({ proposal: null, reviewing: false, error: "" });
  }
  async confirm(commit: (proposal: ChatProposal) => Promise<unknown>) {
    if (
      !this.state.reviewing ||
      !this.state.proposal ||
      this.state.status === "applying" ||
      this.state.status === "sending"
    )
      return;
    const proposal = structuredClone(this.state.proposal);
    if (proposal.baseProfileRevision !== this.revision) {
      this.dismissProposal();
      return;
    }
    this.publish({ status: "applying", error: "" });
    try {
      await commit(proposal);
      this.publish({
        status: "idle",
        proposal: null,
        reviewing: false,
        error: "",
      });
    } catch {
      this.publish({
        status: "error",
        error:
          "Không thể xác nhận đề xuất. Nhu cầu cũ được giữ nguyên; xem lại hoặc thử xác nhận lần nữa.",
      });
    }
  }
  dispose() {
    this.disposed = true;
    ++this.sequence;
    this.active?.abort();
    this.active = null;
    this.listeners.clear();
  }
}
