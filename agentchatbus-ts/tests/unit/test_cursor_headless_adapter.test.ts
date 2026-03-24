import { describe, expect, it } from "vitest";
import { parseCursorHeadlessResult } from "../../src/core/services/adapters/cursorHeadlessAdapter.js";

describe("parseCursorHeadlessResult", () => {
  it("extracts resumable session id and final result text from stream-json output", () => {
    const result = parseCursorHeadlessResult([
      "{\"type\":\"system.init\",\"session_id\":\"cursor-session-123\",\"request_id\":\"req-1\"}",
      "{\"type\":\"assistant.message\",\"text\":\"Thinking...\"}",
      "{\"type\":\"result\",\"result\":\"Final answer\"}",
    ].join("\n"));

    expect(result.sessionId).toBe("cursor-session-123");
    expect(result.requestId).toBe("req-1");
    expect(result.resultText).toBe("Final answer");
    expect(result.rawResult).toMatchObject({
      session_id: "cursor-session-123",
      request_id: "req-1",
      event_count: 3,
      last_assistant_text: "Final answer",
      errors: [],
      ignored_line_count: 0,
    });
  });

  it("retains error events while falling back to assistant text when needed", () => {
    const result = parseCursorHeadlessResult([
      "{\"type\":\"system.init\",\"chat_id\":\"cursor-chat-9\"}",
      "{\"type\":\"error\",\"message\":\"resume mismatch\"}",
      "{\"type\":\"assistant.message\",\"text\":\"Recovered reply\"}",
    ].join("\n"));

    expect(result.sessionId).toBe("cursor-chat-9");
    expect(result.resultText).toBe("Recovered reply");
    expect(result.rawResult).toMatchObject({
      session_id: "cursor-chat-9",
      last_assistant_text: "Recovered reply",
      errors: ["resume mismatch"],
    });
  });
});
