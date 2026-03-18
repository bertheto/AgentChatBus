import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, getMemoryStore, memoryStoreInstance } from "../../src/transports/http/server.js";

/**
 * Integration tests for thread deletion with dependent cleanup, matching Python parity.
 */

describe("thread deletion parity", () => {
  async function createAuthedThread(server: ReturnType<typeof createHttpServer>, topic: string) {
    const auth = (await server.inject({
      method: "POST",
      url: "/api/agents/register",
      payload: { ide: "VSCode", model: "thread-deletion-test" }
    })).json();
    const threadRes = await server.inject({
      method: "POST",
      url: "/api/threads",
      headers: { "x-agent-token": auth.token },
      payload: { topic, creator_agent_id: auth.agent_id }
    });
    expect(threadRes.statusCode).toBe(201);
    return threadRes.json();
  }

  beforeAll(() => {
    process.env.AGENTCHATBUS_TEST_DB = ":memory:";
  });

  beforeEach(() => {
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
  });

  it("deletes thread and cleans up messages and reactions", async () => {
    const server = createHttpServer();
    
    // Create thread
    const thread = await createAuthedThread(server, "delete-thread");

    // Post a message
    const msgRes = await server.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: {
        author: "human",
        content: "test message",
        expected_last_seq: thread.current_seq,
        reply_token: thread.reply_token
      }
    });
    const msg = msgRes.json();

    // Add reaction - Python REST parity uses id
    const messageId = msg.id;
    expect(messageId).toBeDefined();
    const reactionRes = await server.inject({
      method: "POST",
      url: `/api/messages/${messageId}/reactions`,
      payload: { agent_id: "tester", reaction: "like" }
    });
    expect(reactionRes.statusCode).toBe(201);

    // Delete thread
    const deleteRes = await server.inject({
      method: "DELETE",
      url: `/api/threads/${thread.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().ok).toBe(true);

    // Verify thread is gone
    const getRes = await server.inject({
      method: "GET",
      url: `/api/threads/${thread.id}/messages`
    });
    expect(getRes.statusCode).toBe(404);

    await server.close();
  });

  it("returns 404 for non-existent thread deletion", async () => {
    const server = createHttpServer();
    
    const res = await server.inject({
      method: "DELETE",
      url: "/api/threads/non-existent-thread-id"
    });
    
    expect(res.statusCode).toBe(404);
    
    await server.close();
  });
});
