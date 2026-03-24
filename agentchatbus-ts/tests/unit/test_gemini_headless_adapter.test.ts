import { describe, expect, it } from "vitest";
import { parseGeminiHeadlessResult } from "../../src/core/services/adapters/geminiHeadlessAdapter.js";

describe("parseGeminiHeadlessResult", () => {
  it("extracts resumable session id and final result from JSON output", () => {
    const result = parseGeminiHeadlessResult([
      "{\"type\":\"session.started\",\"session_id\":\"gemini-session-1\",\"request_id\":\"req-gemini-1\"}",
      "{\"type\":\"message.delta\",\"text\":\"Partial\"}",
      "{\"type\":\"result\",\"result\":\"Final answer\"}",
    ].join("\n"));

    expect(result.sessionId).toBe("gemini-session-1");
    expect(result.requestId).toBe("req-gemini-1");
    expect(result.resultText).toBe("Final answer");
    expect(result.rawResult).toMatchObject({
      session_id: "gemini-session-1",
      request_id: "req-gemini-1",
      event_count: 3,
      result: "Final answer",
      errors: [],
      ignored_line_count: 0,
    });
  });

  it("retains error events while still using the latest text output", () => {
    const result = parseGeminiHeadlessResult([
      "{\"type\":\"session.started\",\"session_id\":\"gemini-session-1\"}",
      "{\"type\":\"error\",\"message\":\"old cli version\"}",
      "{\"type\":\"message.delta\",\"text\":\"Recovered output\"}",
    ].join("\n"));

    expect(result.sessionId).toBe("gemini-session-1");
    expect(result.resultText).toBe("Recovered output");
    expect(result.rawResult).toMatchObject({
      errors: ["old cli version"],
      result: "Recovered output",
    });
  });
});
