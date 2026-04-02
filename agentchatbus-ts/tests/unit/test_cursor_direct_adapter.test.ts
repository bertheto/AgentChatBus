import { describe, expect, it } from "vitest";
import {
  CursorDirectAdapter,
  parseCursorDirectResult,
} from "../../src/core/services/adapters/cursorDirectAdapter.js";
import { CURSOR_SESSION_ID_ENV_VAR } from "../../src/core/services/adapters/cursorHeadlessAdapter.js";

describe("parseCursorDirectResult", () => {
  it("extracts session/request aliases and marks completed from done-style events", () => {
    const result = parseCursorDirectResult([
      "{\"id\":\"1\",\"result\":{\"chat_id\":\"cursor-chat-1\"}}",
      "{\"id\":\"2\",\"result\":{\"turn_id\":\"turn-44\"}}",
      "{\"method\":\"session/update\",\"params\":{\"chatId\":\"cursor-chat-1\"}}",
      "{\"method\":\"assistant_message_delta\",\"params\":{\"delta\":\"hello \"}}",
      "{\"method\":\"assistant_message_delta\",\"params\":{\"content\":\"world\"}}",
      "{\"method\":\"turn_done\",\"params\":{\"request_id\":\"turn-44\"}}",
    ].join("\n"));

    expect(result.sessionId).toBe("cursor-chat-1");
    expect(result.requestId).toBe("turn-44");
    expect(result.resultText).toBe("hello world");
    expect(result.rawResult).toMatchObject({
      session_id: "cursor-chat-1",
      request_id: "turn-44",
      completed: true,
      ignored_line_count: 0,
      errors: [],
    });
  });

  it("collects rpc errors and notification errors while ignoring non-json lines", () => {
    const result = parseCursorDirectResult([
      "{\"method\":\"error\",\"params\":{\"message\":\"resume mismatch\"}}",
      "{\"id\":\"3\",\"error\":{\"message\":\"session/prompt failed\"}}",
      "non-json-line",
      "{\"method\":\"assistant_message\",\"params\":{\"text\":\"Recovered answer\"}}",
    ].join("\n"));

    expect(result.resultText).toBe("Recovered answer");
    expect(result.rawResult).toMatchObject({
      last_assistant_text: "Recovered answer",
      ignored_line_count: 1,
      errors: ["resume mismatch", "session/prompt failed"],
    });
  });
});

describe("CursorDirectAdapter.run", () => {
  it("uses parsed session/request ids and keeps parsed result payload", async () => {
    const adapter = new CursorDirectAdapter(
      {
        run: async () => ({
          exitCode: 0,
          stdout: [
            "{\"id\":\"1\",\"result\":{\"sessionId\":\"cursor-session-7\"}}",
            "{\"method\":\"assistant_message\",\"params\":{\"text\":\"done\"}}",
            "{\"method\":\"turn_finished\",\"params\":{\"requestId\":\"req-77\"}}",
          ].join("\n"),
          stderr: "",
        }),
      },
      "agent",
    );

    const result = await adapter.run(
      {
        prompt: "hello",
        workspace: ".",
        cols: 120,
        rows: 40,
      },
      {
        signal: new AbortController().signal,
        onOutput: () => {},
        onProcessStart: () => {},
        onControls: () => {},
      },
    );

    expect(result.externalSessionId).toBe("cursor-session-7");
    expect(result.externalRequestId).toBe("req-77");
    expect(result.resultText).toBe("done");
    expect(result.rawResult).toMatchObject({
      completed: true,
      last_assistant_text: "done",
    });
  });

  it("falls back to persisted session id when parsed output does not include one", async () => {
    const adapter = new CursorDirectAdapter(
      {
        run: async () => ({
          exitCode: 0,
          stdout: "{\"method\":\"assistant_message\",\"params\":{\"text\":\"ok\"}}",
          stderr: "",
        }),
      },
      "agent",
    );

    const result = await adapter.run(
      {
        prompt: "hello",
        workspace: ".",
        cols: 120,
        rows: 40,
        env: {
          [CURSOR_SESSION_ID_ENV_VAR]: "persisted-session-1",
        },
      },
      {
        signal: new AbortController().signal,
        onOutput: () => {},
        onProcessStart: () => {},
        onControls: () => {},
      },
    );

    expect(result.externalSessionId).toBe("persisted-session-1");
    expect(result.resultText).toBe("ok");
  });
});
