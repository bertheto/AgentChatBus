import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/transports/http/server.js";
import { memoryStore } from "../../src/core/services/memoryStore.js";
import type { FastifyInstance } from "fastify";

describe("Message Synchronization Parity Tests (Python vs TS)", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    memoryStore.reset();
    server = createHttpServer();
  });

  afterEach(async () => {
    await server.close();
  });

  async function createThread(topic: string) {
    const res = await server.inject({
      method: "POST",
      url: "/api/threads",
      payload: { topic }
    });
    return res.json();
  }

  it("handles sequence tolerance (UP-PARITY)", async () => {
    const thread = await createThread("tolerance-thread");
    
    // Post 3 messages from system or another source to advance sequence
    for (let i = 0; i < 3; i++) {
        await server.inject({
            method: "POST",
            url: `/api/threads/${thread.id}/messages`,
            payload: {
                author: "system",
                content: `background ${i}`,
                role: "system"
            }
        });
    }
    
    // Now try to post with the ORIGINAL sync context (seq=0)
    // Tolerance is 5, so this should SUCCEED
    const res = await server.inject({
        method: "POST",
        url: `/api/threads/${thread.id}/messages`,
        payload: {
            author: "human",
            content: "user message with old seq",
            expected_last_seq: 0,
            reply_token: thread.reply_token
        }
    });
    
    expect(res.statusCode).toBe(201);
    expect(res.json().content).toBe("user message with old seq");
  });

  it("rejects when beyond sequence tolerance", async () => {
    const thread = await createThread("tolerance-fail-thread");
    
    // Post 6 messages to exceed tolerance of 5
    for (let i = 0; i < 6; i++) {
        await server.inject({
            method: "POST",
            url: `/api/threads/${thread.id}/messages`,
            payload: {
                author: "system",
                content: `background ${i}`,
                role: "system"
            }
        });
    }
    
    const res = await server.inject({
        method: "POST",
        url: `/api/threads/${thread.id}/messages`,
        payload: {
            author: "human",
            content: "user message with way too old seq",
            expected_last_seq: 0,
            reply_token: thread.reply_token
        }
    });
    
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error || body.detail?.error).toBe("SEQ_MISMATCH");
    expect(body.current_seq || body.detail?.current_seq).toBe(6);
  });

  it("returns naked array for /api/agents (frontend parity)", async () => {
    const res = await server.inject({
        method: "GET",
        url: "/api/agents"
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("registers and lists agents (UP-PARITY)", async () => {
    const regRes = await server.inject({
        method: "POST",
        url: "/api/agents/register",
        payload: {
            ide: "VSCode",
            model: "GPT-4",
            display_name: "TestAgent",
            capabilities: ["code"],
            skills: [{ id: "lint", name: "Linter" }]
        }
    });
    
    expect(regRes.statusCode).toBe(200);
    const agent = regRes.json();
    expect(agent.agent_id || agent.id).toBeTruthy();
    expect(agent.token).toBeTruthy();
    expect(agent.display_name).toBe("TestAgent");
    
    const listRes = await server.inject({
        method: "GET",
        url: "/api/agents"
    });
    const agents = listRes.json();
    expect(Array.isArray(agents)).toBe(true);
    const found = agents.find((a: any) => a.id === agent.id);
    expect(found).toBeTruthy();
    expect(found.display_name).toBe("TestAgent");
  });
});
