import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, memoryStoreInstance } from "../../src/transports/http/server.js";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

describe("Settings API parity with Python", () => {
  const configFile = join(process.cwd(), "data", "config.json");

  beforeAll(() => {
    process.env.AGENTCHATBUS_TEST_DB = ":memory:";
    // Clean up any existing config file
    if (existsSync(configFile)) {
      unlinkSync(configFile);
    }
  });

  // Helper to create server with specific admin token
  async function createServerWithAdminToken(adminToken?: string) {
    if (adminToken !== undefined) {
      process.env.AGENTCHATBUS_ADMIN_TOKEN = adminToken;
    } else {
      delete process.env.AGENTCHATBUS_ADMIN_TOKEN;
    }
    // Re-import to pick up new env var
    const { createHttpServer: createServer } = await import("../../src/transports/http/server.js");
    return createServer();
  }

  beforeEach(() => {
    if (memoryStoreInstance) {
      memoryStoreInstance.reset();
    }
    // Clean up config file before each test
    if (existsSync(configFile)) {
      unlinkSync(configFile);
    }
  });

  describe("GET /api/settings", () => {
    it("returns config dict matching Python format", async () => {
      const server = createHttpServer();
      const res = await server.inject({
        method: "GET",
        url: "/api/settings"
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Match Python get_config_dict() response format
      expect(body.HOST).toBeDefined();
      expect(body.PORT).toBeDefined();
      expect(body.AGENT_HEARTBEAT_TIMEOUT).toBeDefined();
      expect(body.MSG_WAIT_TIMEOUT).toBeDefined();
      expect(body.REPLY_TOKEN_LEASE_SECONDS).toBeDefined();
      expect(body.SEQ_TOLERANCE).toBeDefined();
      expect(body.SEQ_MISMATCH_MAX_MESSAGES).toBeDefined();
      expect(body.EXPOSE_THREAD_RESOURCES).toBeDefined();
      expect(body.ENABLE_HANDOFF_TARGET).toBeDefined();
      expect(body.ENABLE_STOP_REASON).toBeDefined();
      expect(body.ENABLE_PRIORITY).toBeDefined();
      expect(body.SHOW_AD).toBeDefined();

      await server.close();
    });
  });

  describe("PUT /api/settings", () => {
    it("updates settings without admin token when ADMIN_TOKEN not set", async () => {
      const server = createHttpServer();
      const res = await server.inject({
        method: "PUT",
        url: "/api/settings",
        payload: {
          AGENT_HEARTBEAT_TIMEOUT: 120,
          MSG_WAIT_TIMEOUT: 600
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.message).toContain("Settings saved");

      // Verify settings were saved by reading them back
      const getRes = await server.inject({
        method: "GET",
        url: "/api/settings"
      });
      const getBody = getRes.json();
      expect(getBody.AGENT_HEARTBEAT_TIMEOUT).toBe(120);
      expect(getBody.MSG_WAIT_TIMEOUT).toBe(600);

      await server.close();
    });

    it("accepts update with valid admin token", async () => {
      const server = await createServerWithAdminToken("secret-token");

      const res = await server.inject({
        method: "PUT",
        url: "/api/settings",
        payload: { AGENT_HEARTBEAT_TIMEOUT: 90 },
        headers: { "x-admin-token": "secret-token" }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      // Verify the setting was saved
      const getRes = await server.inject({
        method: "GET",
        url: "/api/settings"
      });
      expect(getRes.json().AGENT_HEARTBEAT_TIMEOUT).toBe(90);

      delete process.env.AGENTCHATBUS_ADMIN_TOKEN;
      await server.close();
    });

    it("filters out null/undefined values", async () => {
      const server = createHttpServer();
      const res = await server.inject({
        method: "PUT",
        url: "/api/settings",
        payload: {
          AGENT_HEARTBEAT_TIMEOUT: 60,
          MSG_WAIT_TIMEOUT: null,
          UNKNOWN_KEY: "should be ignored"
        }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);

      await server.close();
    });
  });
});
