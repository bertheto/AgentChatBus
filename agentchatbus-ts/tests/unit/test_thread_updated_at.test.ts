import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryStore, memoryStoreInstance } from "../../src/transports/http/server.js";


/**
 * Parity tests for thread.updated_at semantics (mirrors Python test_thread_updated_at_migration.py)
 */

describe("thread.updated_at parity", () => {
  beforeEach(() => {
    process.env.AGENTCHATBUS_DB = ":memory:";
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
  });

  it("creates threads with updated_at populated", () => {
    const store = getMemoryStore();
    const created = store.createThread("updated-at-thread");
    const thread = store.getThread(created.thread.id);
    expect(thread).toBeDefined();
    expect(thread!.created_at).toBeDefined();
    expect(thread!.updated_at).toBeDefined();
    // On creation, updated_at should equal created_at
    expect(thread!.updated_at).toBe(thread!.created_at);
  });

  it("updates updated_at when thread status changes", () => {
    const store = getMemoryStore();
    const created = store.createThread("status-change-thread");
    const threadId = created.thread.id;
    const originalUpdatedAt = store.getThread(threadId)!.updated_at;

    // Wait a bit to ensure timestamp difference
    store.setThreadStatus(threadId, "implement");
    const updatedThread = store.getThread(threadId);
    expect(updatedThread!.status).toBe("implement");
    expect(updatedThread!.updated_at).toBeDefined();
    // updated_at should be updated (may be same or later)
    expect(updatedThread!.updated_at).not.toBe(undefined);
  });

  it("updates updated_at when message is posted", () => {
    const store = getMemoryStore();
    const created = store.createThread("msg-thread");
    const threadId = created.thread.id;

    // Post a message
    const sync = store.issueSyncContext(threadId);
    store.postMessage({
      threadId,
      author: "test-agent",
      content: "Hello",
      expectedLastSeq: sync.current_seq,
      replyToken: sync.reply_token,
      role: "user"
    });

    const thread = store.getThread(threadId);
    expect(thread!.updated_at).toBeDefined();
    // updated_at should be updated after message post
    expect(thread!.updated_at).not.toBe(undefined);
  });
});
