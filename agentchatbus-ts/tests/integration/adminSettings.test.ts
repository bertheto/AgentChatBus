import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, getMemoryStore, memoryStoreInstance } from "../../src/transports/http/server.js";

/**
 * Integration coverage for admin settings endpoints, aligned with Python thread admin defaults.
 */

describe("thread admin endpoints parity", () => {
  async function createAuthedThread(server: ReturnType<typeof createHttpServer>, topic: string) {
    const auth = (await server.inject({
      method: "POST",
      url: "/api/agents/register",
      payload: { ide: "Test", model: "admin-settings-thread-creator" }
    })).json() as any;
    const threadRes = await server.inject({
      method: "POST",
      url: "/api/threads",
      headers: { "x-agent-token": auth.token },
      payload: { topic, creator_agent_id: auth.agent_id }
    });
    expect(threadRes.statusCode).toBe(201);
    return { thread: threadRes.json(), auth };
  }

  beforeAll(() => {
    process.env.AGENTCHATBUS_TEST_DB = ":memory:";
  });

  beforeEach(() => {
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
  });

  it("returns creator admin payload for authenticated thread creation", async () => {
    const server = createHttpServer();
    const { thread, auth } = await createAuthedThread(server, "admin-thread");

    const adminRes = await server.inject({
      method: "GET",
      url: `/api/threads/${thread.id}/admin`
    });

    expect(adminRes.statusCode).toBe(200);
    const body = adminRes.json();
    expect(body.admin_id).toBe(auth.agent_id);
    expect(body.admin_name).toBeDefined();
    expect(body.admin_emoji).toBeDefined();
    expect(body.admin_type).toBe("creator");
    expect(body.assigned_at).toBeDefined();

    await server.close();
  });
});
