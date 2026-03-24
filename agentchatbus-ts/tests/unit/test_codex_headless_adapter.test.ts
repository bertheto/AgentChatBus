import { describe, expect, it } from "vitest";
import {
  parseCodexExecJsonResult,
  preferWindowsDecodedText,
} from "../../src/core/services/adapters/codexHeadlessAdapter.js";

describe("parseCodexExecJsonResult", () => {
  it("extracts the resumable thread id and final agent message", () => {
    const result = parseCodexExecJsonResult([
      "{\"type\":\"thread.started\",\"thread_id\":\"019d1d3a-611f-7e91-b1f1-b5a9d8079942\"}",
      "{\"type\":\"turn.started\"}",
      "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"agent_message\",\"text\":\"OK\"}}",
      "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":17365,\"cached_input_tokens\":2432,\"output_tokens\":18}}",
    ].join("\n"));

    expect(result.threadId).toBe("019d1d3a-611f-7e91-b1f1-b5a9d8079942");
    expect(result.resultText).toBe("OK");
    expect(result.rawResult).toMatchObject({
      thread_id: "019d1d3a-611f-7e91-b1f1-b5a9d8079942",
      event_count: 4,
      last_agent_message: "OK",
      errors: [],
      ignored_line_count: 0,
    });
  });

  it("retains error items while still preferring the final agent message", () => {
    const result = parseCodexExecJsonResult([
      "{\"type\":\"thread.started\",\"thread_id\":\"019d1d3a-611f-7e91-b1f1-b5a9d8079942\"}",
      "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"error\",\"message\":\"model mismatch\"}}",
      "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"agent_message\",\"text\":\"Recovered\"}}",
    ].join("\n"));

    expect(result.threadId).toBe("019d1d3a-611f-7e91-b1f1-b5a9d8079942");
    expect(result.resultText).toBe("Recovered");
    expect(result.rawResult).toMatchObject({
      errors: ["model mismatch"],
      last_agent_message: "Recovered",
    });
  });
});

describe("preferWindowsDecodedText", () => {
  it("keeps clean utf8 text when there is no mojibake signal", () => {
    expect(preferWindowsDecodedText("plain english text", "鏂囨湰")).toBe("plain english text");
  });

  it("prefers the legacy-decoded text when utf8 contains replacement characters", () => {
    const utf8Text = "'\\\"C:\\\\Program Files\\\\nodejs\\\\codex.cmd\\\"' �����ڲ����ⲿ����";
    const legacyText = "'\"C:\\Program Files\\nodejs\\codex.cmd\"' 不是内部或外部命令";
    expect(preferWindowsDecodedText(utf8Text, legacyText)).toBe(legacyText);
  });
});
