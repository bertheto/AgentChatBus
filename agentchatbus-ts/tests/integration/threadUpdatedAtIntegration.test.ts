import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, getMemoryStore, memoryStoreInstance } from "../../src/transports/http/server.js";

/**
 * Integration check for thread.updated_at parity with Python. TS schema currently lacks updated_at;
 * this test will begin asserting once the column is available.
 */

describe("thread updated_at integration parity", () => {
  beforeAll(() => {
    process.env.AGENTCHATBUS_TEST_DB = ":memory:";
  });

  beforeEach(() => {
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
  });

  it("sets created_at and updated_at on thread create", async () => {
    const server = createHttpServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/threads",
      payload: { topic: "updated-at-http" }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
    // On creation, updated_at should equal created_at
    expect(body.updated_at).toBe(body.created_at);
    await server.close();
  });

  it("returns updated_at in thread list", async () => {
    const server = createHttpServer();
    // Create a thread
    await server.inject({
      method: "POST",
      url: "/api/threads",
      payload: { topic: "list-thread" }
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/threads"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.threads).toBeInstanceOf(Array);
    expect(body.threads.length).toBeGreaterThan(0);
    expect(body.threads[0].updated_at).toBeDefined();
    await server.close();
  });
});
