import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../web-ui/js/components/acb-modal-shell.js";
import "../../../web-ui/js/shared-modals.js";

function createManifest() {
  return {
    schema_version: "2026-03-19.v1",
    save_message: "Settings saved. Restart the server to apply changes.",
    sections: [
      {
        id: "agent",
        nav_label: "Agent",
        title: "Timeouts",
        order: 10,
        fields: [
          {
            key: "AGENT_HEARTBEAT_TIMEOUT",
            source: "config",
            label: "Agent Heartbeat Timeout (seconds)",
            input_id: "setting-heartbeat",
            type: "integer",
            kind: "duration_seconds",
            description: "Interval used to determine whether an agent is still online.",
            section: "agent",
            scope: "editable",
            sensitivity: "public",
            restart_required: true,
            value: 60,
            editable: true,
            min: 1,
            step: 1,
          },
        ],
      },
      {
        id: "advanced",
        nav_label: "Advanced",
        title: "Advanced",
        order: 40,
        fields: [
          {
            key: "REPLY_TOKEN_LEASE_SECONDS",
            source: "config",
            label: "Reply Token Lease (seconds)",
            input_id: "setting-reply-token-lease-seconds",
            type: "integer",
            kind: "duration_seconds",
            description: "Lifetime of reply tokens before they expire.",
            section: "advanced",
            scope: "editable",
            sensitivity: "public",
            restart_required: true,
            value: 3600,
            editable: true,
            min: 1,
            step: 1,
          },
          {
            key: "EXPOSE_THREAD_RESOURCES",
            source: "config",
            label: "Expose Thread Resources",
            input_id: "setting-expose-thread-resources",
            type: "boolean",
            kind: "feature_flag",
            description: "Allows MCP clients to browse thread resources.",
            section: "advanced",
            scope: "editable",
            sensitivity: "public",
            restart_required: true,
            value: false,
            editable: true,
          },
        ],
      },
      {
        id: "diagnostics",
        nav_label: "Diagnostics",
        title: "Runtime Configuration",
        order: 90,
        fields: [
          {
            key: "PUBLIC_DEMO_MODE",
            source: "diagnostic",
            label: "Public Demo Mode",
            input_id: "setting-public-demo-mode",
            type: "boolean",
            kind: "feature_flag",
            description: "Derived from SHOW_AD.",
            section: "diagnostics",
            scope: "readonly",
            sensitivity: "derived",
            restart_required: false,
            value: false,
            editable: false,
          },
        ],
      },
    ],
  };
}

describe("settings manifest rendering", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const shell = document.createElement("acb-modal-shell");
    document.body.appendChild(shell);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders server-driven fields, advanced tab, and local UI preferences", async () => {
    const api = vi.fn(async (path) => {
      if (path === "/api/settings/manifest") {
        return createManifest();
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    await window.AcbModals.openSettingsModal(api);

    expect(document.getElementById("nav-advanced")).toBeTruthy();
    expect(document.getElementById("setting-reply-token-lease-seconds")).toBeTruthy();
    expect(document.getElementById("setting-expose-thread-resources")).toBeTruthy();
    expect(document.getElementById("nav-ui")).toBeTruthy();
    expect(document.getElementById("setting-minimap")).toBeTruthy();
  });

  it("serializes editable manifest fields when saving settings", async () => {
    const api = vi.fn(async (path, options) => {
      if (path === "/api/settings/manifest") {
        return createManifest();
      }
      if (path === "/api/settings" && options?.method === "PUT") {
        return { ok: true, message: "Saved!" };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    await window.AcbModals.openSettingsModal(api);

    document.getElementById("setting-heartbeat").value = "75";
    document.getElementById("setting-reply-token-lease-seconds").value = "1800";
    document.getElementById("setting-expose-thread-resources").checked = true;

    await window.AcbModals.submitSettings(api);

    const putCall = api.mock.calls.find(([path, options]) => path === "/api/settings" && options?.method === "PUT");
    expect(putCall).toBeTruthy();

    const payload = JSON.parse(putCall[1].body);
    expect(payload.AGENT_HEARTBEAT_TIMEOUT).toBe(75);
    expect(payload.REPLY_TOKEN_LEASE_SECONDS).toBe(1800);
    expect(payload.EXPOSE_THREAD_RESOURCES).toBe(true);
    expect(payload.PUBLIC_DEMO_MODE).toBeUndefined();
  });
});
