import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryStore, memoryStoreInstance } from "../../src/transports/http/server.js";

/**
 * Unit tests for content filtering (API key detection), matching Python test_content_filter_unit.py.
 */

describe("content filter parity", () => {
  beforeEach(() => {
    process.env.AGENTCHATBUS_DB = ":memory:";
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
    // Enable content filter
    process.env.AGENTCHATBUS_CONTENT_FILTER_ENABLED = "true";
  });

  it("rejects messages with GitHub token pattern", () => {
    const store = getMemoryStore();
    const { thread } = store.createThread("filter-thread");
    const sync = store.issueSyncContext(thread.id);

    expect(() => {
      store.postMessage({
        threadId: thread.id,
        author: "human",
        content: "My token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456abcd",
        expectedLastSeq: sync.current_seq,
        replyToken: sync.reply_token
      });
    }).toThrow(/Content blocked|GitHub/i);
  });

  it("allows normal messages without keys", () => {
    const store = getMemoryStore();
    const { thread } = store.createThread("filter-thread");
    const sync = store.issueSyncContext(thread.id);

    const msg = store.postMessage({
      threadId: thread.id,
      author: "human",
      content: "This is a normal message without any secrets",
      expectedLastSeq: sync.current_seq,
      replyToken: sync.reply_token
    });

    expect(msg.id).toBeDefined();
    expect(msg.content).toBe("This is a normal message without any secrets");
  });
});
