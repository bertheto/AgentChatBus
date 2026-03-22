import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../src/shared/eventBus.js";
import { CliMeetingOrchestrator } from "../../src/core/services/cliMeetingOrchestrator.js";
import { MemoryStore } from "../../src/core/services/memoryStore.js";
import type { CliSessionManager, CliSessionSnapshot } from "../../src/core/services/cliSessionManager.js";

function createInteractiveSession(overrides: Partial<CliSessionSnapshot>): CliSessionSnapshot {
  const now = new Date().toISOString();
  return {
    id: "session-1",
    thread_id: "thread-1",
    adapter: "codex",
    mode: "interactive",
    state: "running",
    prompt: "",
    workspace: "C:\\Users\\hankw\\Documents\\AgentChatBus",
    requested_by_agent_id: "requester-1",
    participant_agent_id: "participant-1",
    participant_display_name: "Participant One",
    participant_role: "participant",
    meeting_transport: "agent_mcp",
    created_at: now,
    updated_at: now,
    run_count: 1,
    supports_input: true,
    supports_restart: true,
    supports_resize: true,
    output_cursor: 0,
    raw_result: null,
    shell: "powershell",
    screen_excerpt: ">",
    context_delivery_mode: "join",
    meeting_post_state: "pending",
    ...overrides,
  };
}

async function waitForCondition(check: () => boolean, timeoutMs = 500): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("CliMeetingOrchestrator", () => {
  let store: MemoryStore;
  let sessions: CliSessionSnapshot[];
  let deliverPrompt: ReturnType<typeof vi.fn>;
  let orchestrator: CliMeetingOrchestrator;

  beforeEach(() => {
    store = new MemoryStore(":memory:");
    sessions = [];
    deliverPrompt = vi.fn(async () => ({ ok: true }));

    const cliSessionManager = {
      listSessionsForThread: vi.fn((threadId: string) =>
        sessions.filter((session) => session.thread_id === threadId),
      ),
      deliverPrompt,
      getSession: vi.fn((sessionId: string) =>
        sessions.find((session) => session.id === sessionId) || null,
      ),
    } as unknown as CliSessionManager;

    orchestrator = new CliMeetingOrchestrator(store, cliSessionManager);
  });

  afterEach(() => {
    orchestrator.close();
  });

  it("wakes an agent_mcp participant when a human message arrives and the agent is not in msg_wait", async () => {
    const { thread } = store.createThread("WakeThread");
    const participant = store.registerAgent({ ide: "Codex CLI", model: "gpt-5" });
    const session = createInteractiveSession({
      thread_id: thread.id,
      participant_agent_id: participant.id,
      participant_display_name: participant.display_name || participant.name,
    });
    sessions = [session];

    const sync = store.issueSyncContext(thread.id);
    store.postMessage({
      threadId: thread.id,
      author: "Hank",
      role: "user",
      content: "hello there",
      expectedLastSeq: sync.current_seq,
      replyToken: sync.reply_token,
    });

    await waitForCondition(() => deliverPrompt.mock.calls.length === 1);
    expect(deliverPrompt.mock.calls[0]?.[0]).toBe(session.id);
    expect(deliverPrompt.mock.calls[0]?.[1]).toBe(
      'Please use msg_wait to process messages in "WakeThread".',
    );
  });

  it("does not wake an agent_mcp participant while that participant is actively blocked in msg_wait", async () => {
    const { thread } = store.createThread("WaitingThread");
    const participant = store.registerAgent({ ide: "Codex CLI", model: "gpt-5" });
    const session = createInteractiveSession({
      thread_id: thread.id,
      participant_agent_id: participant.id,
    });
    sessions = [session];
    (store as any).enterWaitState(thread.id, participant.id, 600_000);

    const sync = store.issueSyncContext(thread.id);
    store.postMessage({
      threadId: thread.id,
      author: "Hank",
      role: "user",
      content: "are you still there?",
      expectedLastSeq: sync.current_seq,
      replyToken: sync.reply_token,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(deliverPrompt).not.toHaveBeenCalled();
  });

  it("wakes an agent_mcp participant for another participant's message but not for its own posts", async () => {
    const { thread } = store.createThread("PeerWakeThread");
    const participant = store.registerAgent({ ide: "Codex CLI", model: "gpt-5" });
    const otherAgent = store.registerAgent({ ide: "Claude CLI", model: "sonnet" });
    const session = createInteractiveSession({
      thread_id: thread.id,
      participant_agent_id: participant.id,
    });
    sessions = [session];

    const otherSync = store.issueSyncContext(thread.id, otherAgent.id, "msg_post");
    store.postMessage({
      threadId: thread.id,
      author: otherAgent.id,
      role: "assistant",
      content: "new peer update",
      expectedLastSeq: otherSync.current_seq,
      replyToken: otherSync.reply_token,
    });

    await waitForCondition(() => deliverPrompt.mock.calls.length === 1);
    expect(deliverPrompt).toHaveBeenCalledTimes(1);

    deliverPrompt.mockClear();

    const selfSync = store.issueSyncContext(thread.id, participant.id, "msg_post");
    store.postMessage({
      threadId: thread.id,
      author: participant.id,
      role: "assistant",
      content: "my own update",
      expectedLastSeq: selfSync.current_seq,
      replyToken: selfSync.reply_token,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(deliverPrompt).not.toHaveBeenCalled();
  });

  it("queues a wake prompt while the session is busy and flushes it once the session becomes idle", async () => {
    const { thread } = store.createThread("BusyWakeThread");
    const participant = store.registerAgent({ ide: "Codex CLI", model: "gpt-5" });
    const session = createInteractiveSession({
      id: "session-busy",
      thread_id: thread.id,
      participant_agent_id: participant.id,
      reply_capture_state: "working",
    });
    sessions = [session];

    const sync = store.issueSyncContext(thread.id);
    store.postMessage({
      threadId: thread.id,
      author: "Hank",
      role: "user",
      content: "please continue",
      expectedLastSeq: sync.current_seq,
      replyToken: sync.reply_token,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(deliverPrompt).not.toHaveBeenCalled();

    session.reply_capture_state = "completed";
    eventBus.emit({
      type: "cli.session.state",
      payload: {
        session,
      },
    });

    await waitForCondition(() => deliverPrompt.mock.calls.length === 1);
    expect(deliverPrompt.mock.calls[0]?.[1]).toBe(
      'Please use msg_wait to process messages in "BusyWakeThread".',
    );
  });
});
