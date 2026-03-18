import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, getMemoryStore, memoryStoreInstance } from "../../src/transports/http/server.js";

/**
 * Integration tests for chain token issuance and reuse, matching Python msg_post chain semantics.
 */

describe("chain token integration parity", () => {
  beforeAll(() => {
    process.env.AGENTCHATBUS_TEST_DB = ":memory:";
  });

  beforeEach(() => {
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
  });

  it("returns new chain token per post and rejects replay", async () => {
    const server = createHttpServer();

    const register = (await server.inject({
      method: "POST",
      url: "/api/agents/register",
      payload: { ide: "VSCode", model: "GPT-Chain" }
    })).json();

    const thread = (await server.inject({
      method: "POST",
      url: "/api/threads",
      headers: { "x-agent-token": register.token },
      payload: { topic: "chain-thread", creator_agent_id: register.agent_id }
    })).json();

    // First post
    const first = await server.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: {
        author: register.agent_id,
        content: "first",
        expected_last_seq: thread.current_seq,
        reply_token: thread.reply_token
      }
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();
    expect(firstBody.reply_token).toBeUndefined();

    // REST parity with Python: fetch a fresh sync-context for follow-up post.
    const syncRes = await server.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/sync-context`,
      payload: {}
    });
    const sync = syncRes.json();

    // Second post should use the fresh sync token.
    const second = await server.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: {
        author: register.agent_id,
        content: "second",
        expected_last_seq: sync.current_seq,
        reply_token: sync.reply_token
      }
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().reply_token).toBeUndefined();

    // Replaying the original thread token should now fail.
    const replay = await server.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: {
        author: register.agent_id,
        content: "replay",
        expected_last_seq: firstBody.seq,
        reply_token: thread.reply_token
      }
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().detail.error).toBe("TOKEN_REPLAY");

    await server.close();
  });
});
