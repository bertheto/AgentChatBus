import { dirname } from "node:path";
import { existsSync } from "node:fs";
import spawn from "cross-spawn";
import type { Writable } from "node:stream";
import type {
  CliAdapterActivityEvent,
  CliAdapterNativeRuntimeEvent,
  CliSessionAdapter,
  CliAdapterRunHooks,
  CliAdapterRunInput,
  CliAdapterRunResult,
} from "./types.js";
import { normalizeWorkspacePath, terminateChildProcessTree } from "./utils.js";
import { WINDOWS_POWERSHELL } from "./constants.js";
import { CLAUDE_SESSION_ID_ENV_VAR, resolveClaudeCommand } from "./claudeHeadlessAdapter.js";

type ClaudeDirectCommandRequest = {
  command: string;
  prompt: string;
  workspace: string;
  model?: string;
  permissionMode?: string;
  env?: Record<string, string>;
};

type ClaudeDirectCommandExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type ClaudeDirectResultEnvelope = {
  resultText?: string;
  rawResult?: Record<string, unknown> | null;
  sessionId?: string;
  requestId?: string;
};

type ClaudeContentBlockState = {
  id: string;
  type: string;
  name?: string;
  text?: string;
  thinking?: string;
  partialJson?: string;
};

type ClaudeSdkMessageContentBlock = {
  type?: unknown;
  text?: unknown;
  thinking?: unknown;
  name?: unknown;
  id?: unknown;
  input?: unknown;
};

interface ClaudeDirectCommandExecutor {
  run(
    request: ClaudeDirectCommandRequest,
    hooks: CliAdapterRunHooks,
  ): Promise<ClaudeDirectCommandExecutionResult>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clipText(value: unknown, maxLength = 280): string | undefined {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractRawString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function appendRawDelta(current: string | undefined, delta: string | undefined): string | undefined {
  if (typeof delta !== "string" || !delta.length) {
    return current;
  }
  return `${current || ""}${delta}`;
}

function normalizeRuntimePhase(
  phase: CliAdapterNativeRuntimeEvent["phase"] | undefined,
): CliAdapterNativeRuntimeEvent["phase"] {
  if (
    phase === "starting"
    || phase === "running"
    || phase === "interrupting"
    || phase === "completed"
    || phase === "interrupted"
    || phase === "failed"
    || phase === "idle"
  ) {
    return phase;
  }
  return "idle";
}

function extractString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function classifyToolActivityKind(toolName: string | undefined): CliAdapterActivityEvent["kind"] {
  const normalized = String(toolName || "").trim().toLowerCase();
  if (
    normalized.includes("bash")
    || normalized.includes("terminal")
    || normalized.includes("command")
    || normalized.includes("shell")
    || normalized.includes("exec")
  ) {
    return "command_execution";
  }
  if (
    normalized.includes("edit")
    || normalized.includes("write")
    || normalized.includes("file")
    || normalized.includes("patch")
  ) {
    return "file_change";
  }
  if (normalized.includes("mcp")) {
    return "mcp_tool_call";
  }
  return "dynamic_tool_call";
}

function buildDefaultSchemaValue(schema: unknown): unknown {
  if (!isRecord(schema)) {
    return "";
  }
  const schemaType = String(schema.type || "").trim().toLowerCase();
  if (schemaType === "boolean") {
    return false;
  }
  if (schemaType === "integer" || schemaType === "number") {
    return 0;
  }
  if (schemaType === "array") {
    const minItems = Math.max(0, Number(schema.minItems) || 0);
    const itemValue = buildDefaultSchemaValue(schema.items);
    return Array.from({ length: minItems }, () => itemValue);
  }
  if (schemaType === "object") {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      result[key] = buildDefaultSchemaValue(value);
    }
    return result;
  }
  return "";
}

function buildClaudeElicitationContent(request: Record<string, unknown>): Record<string, unknown> {
  const requestedSchema = isRecord(request.requested_schema)
    ? request.requested_schema
    : (isRecord(request.requestedSchema) ? request.requestedSchema : null);
  const properties = requestedSchema && isRecord(requestedSchema.properties)
    ? requestedSchema.properties
    : null;
  if (!properties) {
    return {};
  }
  const content: Record<string, unknown> = {};
  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    content[fieldName] = buildDefaultSchemaValue(fieldSchema);
  }
  return content;
}

function writeJsonLine(stream: Writable | null | undefined, payload: Record<string, unknown>): void {
  if (!stream || stream.destroyed || stream.writableEnded) {
    return;
  }
  stream.write(`${JSON.stringify(payload)}\n`);
}

function buildClaudeUserMessagePayload(text: string): Record<string, unknown> | null {
  const normalized = String(text || "").replace(/\r/g, "").trim();
  if (!normalized) {
    return null;
  }
  return {
    type: "user",
    session_id: "",
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text: normalized,
        },
      ],
    },
    parent_tool_use_id: null,
  };
}

function createControlRequestId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildClaudeControlResponse(
  message: Record<string, unknown>,
): { response: Record<string, unknown>; logLine: string } | null {
  if (message.type !== "control_request") {
    return null;
  }
  const requestId = typeof message.request_id === "string" ? message.request_id.trim() : "";
  const request = isRecord(message.request) ? message.request : null;
  const subtype = String(request?.subtype || "").trim().toLowerCase();
  if (!requestId || !request || !subtype) {
    return null;
  }

  if (subtype === "can_use_tool") {
    const toolName = extractString(request, ["tool_name", "toolName"]) || "unknown_tool";
    const toolUseId = extractString(request, ["tool_use_id", "toolUseID"]);
    return {
      response: {
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: {
            behavior: "allow",
            updatedInput: isRecord(request.input) ? request.input : {},
            ...(toolUseId ? { toolUseID: toolUseId } : {}),
          },
        },
      },
      logLine: `[claude-direct] Auto-approved tool permission for '${toolName}'.`,
    };
  }

  if (subtype === "elicitation") {
    const serverName = extractString(request, ["mcp_server_name", "server_name"]) || "unknown-server";
    return {
      response: {
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: {
            action: "accept",
            content: buildClaudeElicitationContent(request),
          },
        },
      },
      logLine: `[claude-direct] Auto-accepted elicitation from '${serverName}'.`,
    };
  }

  return null;
}

class ClaudeDirectStreamParser {
  private readonly blocks = new Map<number, ClaudeContentBlockState>();
  private lineBuffer = "";
  private sessionId?: string;
  private requestId?: string;
  private resultText?: string;
  private eventCount = 0;
  private ignoredLineCount = 0;
  private errorMessages: string[] = [];
  private emittedRunning = false;
  private partialAssistantText = "";
  private firstResultSeen = false;
  private lastSessionState: "idle" | "running" | "requires_action" | undefined;

  constructor(private readonly hooks: CliAdapterRunHooks) {}

  push(text: string): void {
    this.lineBuffer += text;
    while (true) {
      const newlineIndex = this.lineBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }
      const line = this.lineBuffer.slice(0, newlineIndex).trim();
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      this.consumeLine(line);
    }
  }

  hasFirstResult(): boolean {
    return this.firstResultSeen;
  }

  finalize(): ClaudeDirectResultEnvelope {
    const trailing = this.lineBuffer.trim();
    if (trailing) {
      this.consumeLine(trailing);
      this.lineBuffer = "";
    }
    return {
      resultText: this.resultText || this.partialAssistantText || "",
      sessionId: this.sessionId,
      requestId: this.requestId,
      rawResult: {
        session_id: this.sessionId || null,
        request_id: this.requestId || null,
        event_count: this.eventCount,
        result: this.resultText || this.partialAssistantText || null,
        errors: [...this.errorMessages],
        ignored_line_count: this.ignoredLineCount,
      },
    };
  }

  private consumeLine(line: string): void {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      this.eventCount += 1;
      this.captureIds(parsed);
      this.handleEvent(parsed);
    } catch {
      this.ignoredLineCount += 1;
    }
  }

  private captureIds(event: Record<string, unknown>): void {
    const sessionId = extractString(event, ["session_id", "sessionId", "conversation_id", "conversationId"]);
    const requestId = extractString(event, ["request_id", "requestId"]);
    if (!this.sessionId && sessionId) {
      this.sessionId = sessionId;
    }
    if (!this.requestId && requestId) {
      this.requestId = requestId;
    }
  }

  private handleEvent(event: Record<string, unknown>): void {
    const type = String(event.type || "").trim().toLowerCase();
    if (!type || type === "ping") {
      return;
    }
    if (!this.emittedRunning) {
      this.emittedRunning = true;
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        phase: "running",
      });
    }

    if (type === "message_start" || type === "session.started" || type === "session_start") {
      this.emitTask("in_progress", "Response started", "Claude started responding.");
      return;
    }

    if (type === "assistant") {
      this.handleAssistantMessage(event);
      return;
    }

    if (type === "system") {
      this.handleSystemMessage(event);
      return;
    }

    if (type === "stream_event") {
      const nested = isRecord(event.event) ? event.event : null;
      if (nested) {
        this.handleEvent(nested);
      }
      return;
    }

    if (type === "control_request") {
      this.handleControlRequest(event);
      return;
    }

    if (type === "control_cancel_request" || type === "control_response") {
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        thread_status_type: "active",
        thread_active_flags: [],
        phase: this.lastSessionState === "running" ? "running" : "idle",
      });
      return;
    }

    if (type === "tool_progress") {
      this.handleToolProgress(event);
      return;
    }

    if (type === "tool_use_summary") {
      this.emitTask(
        "completed",
        "Tool summary",
        extractString(event, ["summary"]) || "Claude finished a batch of tool work.",
      );
      return;
    }

    if (type === "message_stop") {
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        turn_status: "completed",
        phase: "completed",
      });
      return;
    }

    if (type === "result") {
      this.firstResultSeen = true;
      const subtype = String(event.subtype || "").trim().toLowerCase();
      const resultText = extractString(event, ["result", "text", "message"]);
      if (resultText) {
        this.resultText = resultText;
      }
      if (subtype === "success") {
        this.emitTask("completed", "Completed", resultText || this.partialAssistantText || "Claude completed the task.");
      } else {
        const errorSummary = clipText(
          extractString(event, ["errors", "error", "message"])
            || (Array.isArray(event.errors) ? String(event.errors[0] || "") : "")
            || resultText
            || "Claude direct session failed.",
          360,
        ) || "Claude direct session failed.";
        this.errorMessages.push(errorSummary);
        this.emitTask("failed", "Error", errorSummary);
      }
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        turn_status: subtype === "success" ? "completed" : "failed",
        phase: subtype === "success" ? "completed" : "failed",
        last_error: subtype === "success" ? undefined : this.errorMessages[this.errorMessages.length - 1],
      });
      return;
    }

    if (type === "error") {
      const message = extractString(event, ["message", "error", "detail"]) || "Claude direct session failed.";
      this.errorMessages.push(message);
      this.emitTask("failed", "Error", message);
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        turn_status: "failed",
        phase: "failed",
        last_error: message,
      });
      return;
    }

    if (type === "content_block_start") {
      this.handleContentBlockStart(event);
      return;
    }

    if (type === "content_block_delta") {
      this.handleContentBlockDelta(event);
      return;
    }

    if (type === "content_block_stop") {
      this.handleContentBlockStop(event);
      return;
    }

    if (type === "message_delta") {
      const delta = isRecord(event.delta) ? event.delta : undefined;
      const stopReason = delta ? extractString(delta, ["stop_reason", "stopReason"]) : undefined;
      if (stopReason) {
        this.emitTask("in_progress", "Response updated", stopReason);
      }
    }
  }

  private handleAssistantMessage(event: Record<string, unknown>): void {
    const message = isRecord(event.message) ? event.message : null;
    const content = Array.isArray(message?.content) ? message.content : [];
    let sawText = false;
    for (const block of content) {
      if (!isRecord(block)) {
        continue;
      }
      const normalizedBlock = block as ClaudeSdkMessageContentBlock;
      const blockType = String(normalizedBlock.type || "").trim().toLowerCase();
      if (blockType === "text") {
        const text = clipText(normalizedBlock.text, 2000);
        if (text) {
          this.partialAssistantText = `${this.partialAssistantText || ""}${text}`;
          this.emitTask("in_progress", "Drafting response", text);
          sawText = true;
        }
        continue;
      }
      if (blockType === "thinking") {
        const thinking = clipText(normalizedBlock.thinking, 280) || "Thinking...";
        this.emitThinking("in_progress", thinking);
        continue;
      }
      if (blockType === "tool_use") {
        const id = extractString(block, ["id"]) || `tool:${this.eventCount}`;
        const name = extractString(block, ["name"]) || "Tool";
        const summary = clipText(JSON.stringify(block.input || {}), 280) || name;
        this.emitTool(
          {
            id,
            type: blockType,
            name,
          },
          "in_progress",
          summary,
        );
      }
    }
    if (sawText) {
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        thread_status_type: "active",
        thread_active_flags: [],
        phase: "running",
      });
    }
  }

  private handleSystemMessage(event: Record<string, unknown>): void {
    const subtype = String(event.subtype || "").trim().toLowerCase();
    if (subtype === "init") {
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        thread_id: extractString(event, ["session_id", "sessionId"]) || this.sessionId,
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        thread_status_type: "active",
        thread_active_flags: [],
        phase: "starting",
      });
      this.emitTask("in_progress", "Connected", "Claude direct session initialized.");
      return;
    }
    if (subtype === "session_state_changed") {
      const state = String(event.state || "").trim().toLowerCase() as "idle" | "running" | "requires_action";
      this.lastSessionState = state;
      if (state === "running") {
        this.hooks.onNativeRuntime?.({
          at: nowIso(),
          active_turn_id: this.requestId,
          last_turn_id: this.requestId,
          thread_status_type: "active",
          thread_active_flags: [],
          phase: "running",
        });
        return;
      }
      if (state === "requires_action") {
        this.hooks.onNativeRuntime?.({
          at: nowIso(),
          active_turn_id: this.requestId,
          last_turn_id: this.requestId,
          thread_status_type: "active",
          thread_active_flags: ["waitingOnApproval"],
          phase: "running",
        });
        return;
      }
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        thread_status_type: "idle",
        thread_active_flags: [],
        phase: this.firstResultSeen ? "completed" : "idle",
      });
      return;
    }
    if (subtype === "status") {
      const status = isRecord(event.status) ? event.status : null;
      const statusType = extractString(status || {}, ["type"]);
      const summary = clipText(
        extractString(status || {}, ["message", "summary", "detail"])
          || extractString(event, ["message", "description"]),
        280,
      );
      if (summary) {
        this.emitTask("in_progress", "Status", summary);
      }
      this.hooks.onNativeRuntime?.({
        at: nowIso(),
        active_turn_id: this.requestId,
        last_turn_id: this.requestId,
        thread_status_type: "active",
        thread_active_flags: statusType === "requires_action" ? ["waitingOnApproval"] : [],
        phase: statusType === "requires_action" ? "running" : normalizeRuntimePhase(this.lastSessionState === "running" ? "running" : "idle"),
      });
      return;
    }
    if (subtype === "task_started") {
      this.emitTask(
        "in_progress",
        "Task started",
        extractString(event, ["description", "prompt"]) || "Claude started a task.",
      );
      return;
    }
    if (subtype === "task_progress") {
      this.emitTask(
        "in_progress",
        "Task progress",
        extractString(event, ["summary", "description"]) || "Claude updated task progress.",
      );
      return;
    }
    if (subtype === "task_notification") {
      const status = String(event.status || "").trim().toLowerCase();
      this.emitTask(
        status === "failed" ? "failed" : "completed",
        status === "failed" ? "Task failed" : "Task completed",
        extractString(event, ["summary"]) || "Claude finished a task.",
      );
      return;
    }
    if (subtype === "post_turn_summary") {
      const statusCategory = String(event.status_category || "").trim().toLowerCase();
      const summary = clipText(
        extractString(event, ["description", "status_detail", "recent_action", "needs_action"]),
        300,
      ) || "Claude updated the latest turn summary.";
      this.emitTask(
        statusCategory === "failed" || statusCategory === "blocked" ? "failed" : "completed",
        "Turn summary",
        summary,
      );
      return;
    }
    if (subtype === "local_command_output") {
      this.hooks.onActivity?.({
        at: nowIso(),
        turn_id: this.requestId,
        item_id: `command:${this.eventCount}`,
        kind: "command_execution",
        status: "in_progress",
        label: "Command",
        summary: clipText(extractString(event, ["content"]) || "Local command output", 280),
      });
      return;
    }
    if (subtype === "files_persisted") {
      const files = Array.isArray(event.files) ? event.files : [];
      this.hooks.onActivity?.({
        at: nowIso(),
        turn_id: this.requestId,
        item_id: `files:${this.eventCount}`,
        kind: "file_change",
        status: "completed",
        label: "Files",
        summary: clipText(
          files.length
            ? `Persisted ${files.length} file${files.length === 1 ? "" : "s"}.`
            : "Files persisted.",
          240,
        ),
        files: files
          .filter(isRecord)
          .slice(0, 8)
          .map((file) => ({
            path: extractString(file, ["filename"]) || "unknown",
            change_type: "update" as const,
          })),
      });
    }
  }

  private handleControlRequest(event: Record<string, unknown>): void {
    const request = isRecord(event.request) ? event.request : null;
    const subtype = String(request?.subtype || "").trim().toLowerCase();
    if (subtype === "can_use_tool") {
      const toolName = extractString(request || {}, ["tool_name", "toolName"]) || "Tool";
      this.emitTool(
        {
          id: extractString(request || {}, ["tool_use_id"]) || `tool:${this.eventCount}`,
          type: "tool_use",
          name: toolName,
        },
        "in_progress",
        clipText(JSON.stringify(request?.input || {}), 280) || toolName,
      );
      return;
    }
    if (subtype === "elicitation") {
      const serverName = extractString(request || {}, ["mcp_server_name", "server_name"]) || "MCP";
      this.hooks.onActivity?.({
        at: nowIso(),
        turn_id: this.requestId,
        item_id: `mcp:${this.eventCount}`,
        kind: "mcp_tool_call",
        status: "in_progress",
        label: "MCP request",
        server: serverName,
        summary: clipText(extractString(request || {}, ["title", "description", "message"]) || "MCP elicitation", 280),
      });
    }
  }

  private handleToolProgress(event: Record<string, unknown>): void {
    const toolName = extractString(event, ["tool_name", "toolName"]) || "Tool";
    const elapsedSeconds = Number(event.elapsed_time_seconds);
    this.hooks.onActivity?.({
      at: nowIso(),
      turn_id: this.requestId,
      item_id: `tool-progress:${extractString(event, ["tool_use_id"]) || this.eventCount}`,
      kind: classifyToolActivityKind(toolName),
      status: "in_progress",
      label: toolName,
      tool: toolName,
      summary: Number.isFinite(elapsedSeconds)
        ? `${toolName} running for ${Math.round(elapsedSeconds)}s`
        : `${toolName} is running`,
    });
  }

  private handleContentBlockStart(event: Record<string, unknown>): void {
    const index = Number(event.index);
    const block = isRecord(event.content_block) ? event.content_block : {};
    const type = String(block.type || "").trim().toLowerCase() || "unknown";
    const id = extractString(block, ["id"]) || `${type}:${Number.isFinite(index) ? index : this.blocks.size}`;
    const name = extractString(block, ["name", "tool_name", "toolName"]);
    const state: ClaudeContentBlockState = { id, type, name };
    this.blocks.set(Number.isFinite(index) ? index : this.blocks.size, state);

    if (type === "thinking") {
      this.emitThinking("in_progress", "Thinking...");
      return;
    }
    if (type === "tool_use" || type === "server_tool_use" || type === "mcp_tool_use") {
      this.emitTool(state, "in_progress", name || "Using tool");
    }
  }

  private handleContentBlockDelta(event: Record<string, unknown>): void {
    const index = Number(event.index);
    const state = this.blocks.get(index);
    const delta = isRecord(event.delta) ? event.delta : undefined;
    if (!state || !delta) {
      return;
    }
    const deltaType = String(delta.type || "").trim().toLowerCase();

    if (deltaType === "thinking_delta") {
      state.thinking = appendRawDelta(state.thinking, extractRawString(delta, ["thinking"]));
      this.emitThinking("in_progress", state.thinking || "Thinking...");
      return;
    }

    if (deltaType === "text_delta") {
      const textDelta = extractRawString(delta, ["text"]);
      state.text = appendRawDelta(state.text, textDelta);
      this.partialAssistantText = appendRawDelta(this.partialAssistantText, textDelta) || this.partialAssistantText;
      this.emitTask("in_progress", "Drafting response", state.text || "Drafting response");
      return;
    }

    if (deltaType === "input_json_delta") {
      state.partialJson = appendRawDelta(
        state.partialJson,
        extractRawString(delta, ["partial_json", "partialJson"]),
      );
      this.emitTool(state, "in_progress", state.partialJson || state.name || "Using tool");
      return;
    }
  }

  private handleContentBlockStop(event: Record<string, unknown>): void {
    const index = Number(event.index);
    const state = this.blocks.get(index);
    if (!state) {
      return;
    }
    if (state.type === "thinking") {
      this.emitThinking("completed", state.thinking || "Thinking");
      return;
    }
    if (state.type === "tool_use" || state.type === "server_tool_use" || state.type === "mcp_tool_use") {
      this.emitTool(state, "completed", state.partialJson || state.name || "Tool completed");
      return;
    }
    if (state.type === "text") {
      this.emitTask("in_progress", "Drafting response", state.text || this.partialAssistantText || "Drafting response");
    }
  }

  private emitThinking(status: CliAdapterActivityEvent["status"], summary: string): void {
    this.hooks.onActivity?.({
      at: nowIso(),
      turn_id: this.requestId,
      item_id: "thinking:root",
      kind: "thinking",
      status,
      label: "Thinking",
      summary: clipText(summary, 280),
    });
  }

  private emitTask(status: CliAdapterActivityEvent["status"], label: string, summary?: string): void {
    this.hooks.onActivity?.({
      at: nowIso(),
      turn_id: this.requestId,
      item_id: "task:response",
      kind: "task",
      status,
      label,
      summary: clipText(summary, status === "completed" ? 360 : 280),
    });
  }

  private emitTool(
    state: ClaudeContentBlockState,
    status: CliAdapterActivityEvent["status"],
    summary?: string,
  ): void {
    const kind = classifyToolActivityKind(state.name);
    this.hooks.onActivity?.({
      at: nowIso(),
      turn_id: this.requestId,
      item_id: `tool:${state.id}`,
      kind,
      status,
      label: state.name || "Tool",
      tool: state.name,
      summary: clipText(summary || state.name || "Using tool", 280),
    });
  }
}

class ClaudeDirectExecutor implements ClaudeDirectCommandExecutor {
  async run(
    request: ClaudeDirectCommandRequest,
    hooks: CliAdapterRunHooks,
  ): Promise<ClaudeDirectCommandExecutionResult> {
    return await new Promise<ClaudeDirectCommandExecutionResult>((resolve, reject) => {
      const resumeSessionId = String(request.env?.[CLAUDE_SESSION_ID_ENV_VAR] || "").trim();
      const requestedModel = String(request.model || "").trim();
      const requestedPermissionMode = String(request.permissionMode || "").trim();
      const skipPermissions =
        requestedPermissionMode === "bypassPermissions"
        || requestedPermissionMode === "dontAsk";
      const claudeArgs = [
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--input-format",
        "stream-json",
        "--permission-prompt-tool",
        "stdio",
        "--include-partial-messages",
        ...(resumeSessionId ? ["--resume", resumeSessionId] : []),
        ...(requestedModel ? ["--model", requestedModel] : []),
        ...(requestedPermissionMode ? ["--permission-mode", requestedPermissionMode] : []),
        ...(skipPermissions ? ["--dangerously-skip-permissions"] : []),
      ];

      const env = { ...process.env, ...(request.env || {}) };
      const isWindows = process.platform === "win32";
      const isPowerShellShim = isWindows && /\.ps1$/i.test(request.command);
      const command = isWindows && isPowerShellShim ? WINDOWS_POWERSHELL : request.command;
      const args = isWindows
        ? (isPowerShellShim
          ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", request.command, ...claudeArgs]
          : claudeArgs)
        : claudeArgs;

      if (isWindows) {
        const commandDir = dirname(request.command);
        if (commandDir && commandDir !== "." && existsSync(commandDir)) {
          const currentPath = String(env.Path || env.PATH || "");
          if (!currentPath.toLowerCase().includes(commandDir.toLowerCase())) {
            env.Path = `${commandDir};${currentPath}`;
            env.PATH = env.Path;
          }
        }
      }

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, {
          cwd: request.workspace,
          env,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        reject(error);
        return;
      }

      const streamParser = new ClaudeDirectStreamParser(hooks);
      let stdout = "";
      let stderr = "";
      let stdoutLineBuffer = "";
      let settled = false;
      let childExited = false;
      let interruptSent = false;
      let forceKillTimer: NodeJS.Timeout | null = null;
      let initialPromptSent = false;

      const finalize = (result: ClaudeDirectCommandExecutionResult) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const clearForceKillTimer = () => {
        if (!forceKillTimer) {
          return;
        }
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      };

      const sendUserPrompt = (text: string) => {
        const payload = buildClaudeUserMessagePayload(text);
        if (!payload || childExited) {
          return false;
        }
        writeJsonLine(child.stdin, payload);
        hooks.onNativeRuntime?.({
          at: nowIso(),
          active_turn_id: undefined,
          last_turn_id: undefined,
          thread_status_type: "active",
          thread_active_flags: [],
          phase: "running",
        });
        return true;
      };

      const requestStop = () => {
        if (childExited) {
          return;
        }
        if (!interruptSent) {
          interruptSent = true;
          writeJsonLine(child.stdin, {
            type: "control_request",
            request_id: createControlRequestId("interrupt"),
            request: {
              subtype: "interrupt",
            },
          });
          hooks.onNativeRuntime?.({
            at: nowIso(),
            active_turn_id: undefined,
            last_turn_id: undefined,
            phase: "interrupting",
          });
        }
        if (!forceKillTimer) {
          forceKillTimer = setTimeout(() => {
            if (childExited) {
              return;
            }
            terminateChildProcessTree(child);
          }, 1500);
        }
      };

      hooks.onControls({
        kill: requestStop,
        write: (text) => {
          sendUserPrompt(text);
        },
      });

      if (typeof child.pid === "number" && child.pid > 0) {
        hooks.onProcessStart(child.pid);
      }

      writeJsonLine(child.stdin, {
        type: "control_request",
        request_id: createControlRequestId("init"),
        request: {
          subtype: "initialize",
        },
      });

      initialPromptSent = sendUserPrompt(request.prompt);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        stdoutLineBuffer += text;
        while (true) {
          const newlineIndex = stdoutLineBuffer.indexOf("\n");
          if (newlineIndex === -1) {
            break;
          }
          const line = stdoutLineBuffer.slice(0, newlineIndex).trim();
          stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1);
          if (!line) {
            continue;
          }
          const parsed = (() => {
            try {
              return JSON.parse(line) as Record<string, unknown>;
            } catch {
              return null;
            }
          })();
          if (parsed) {
            const controlResponse = buildClaudeControlResponse(parsed);
            if (controlResponse) {
              writeJsonLine(child.stdin, controlResponse.response);
              hooks.onOutput("stderr", `${controlResponse.logLine}\n`);
            }
          }
          streamParser.push(`${line}\n`);
        }
        hooks.onOutput("stdout", text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        hooks.onOutput("stderr", text);
      });

      child.on("error", (error) => {
        fail(error);
      });

      child.on("close", (code) => {
        childExited = true;
        clearForceKillTimer();
        const trailingLine = stdoutLineBuffer.trim();
        if (trailingLine) {
          const parsed = (() => {
            try {
              return JSON.parse(trailingLine) as Record<string, unknown>;
            } catch {
              return null;
            }
          })();
          if (parsed) {
            const controlResponse = buildClaudeControlResponse(parsed);
            if (controlResponse) {
              hooks.onOutput("stderr", `${controlResponse.logLine}\n`);
            }
          }
          streamParser.push(`${trailingLine}\n`);
        }
        const parsed = streamParser.finalize();
        const mergedStdout = stdout.trim() ? stdout : JSON.stringify(parsed.rawResult || {});
        finalize({
          exitCode: typeof code === "number" ? code : null,
          stdout: mergedStdout,
          stderr,
        });
      });

      hooks.signal.addEventListener(
        "abort",
        () => {
          requestStop();
        },
        { once: true },
      );

      if (!initialPromptSent && String(request.prompt || "").trim()) {
        hooks.onOutput(
          "stderr",
          "[claude-direct] Initial prompt was empty after normalization and was not sent.\n",
        );
      }
    });
  }
}

export function parseClaudeDirectResult(stdout: string): ClaudeDirectResultEnvelope {
  const lines = String(stdout || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const parser = new ClaudeDirectStreamParser({
    signal: new AbortController().signal,
    onOutput: () => {},
    onProcessStart: () => {},
    onControls: () => {},
  });
  for (const line of lines) {
    parser.push(`${line}\n`);
  }
  return parser.finalize();
}

export class ClaudeDirectAdapter implements CliSessionAdapter {
  readonly adapterId = "claude" as const;
  readonly mode = "direct" as const;
  readonly supportsInput = true;
  readonly supportsRestart = true;
  readonly supportsResize = false;
  readonly requiresPrompt = true;

  constructor(
    private readonly executor: ClaudeDirectCommandExecutor = new ClaudeDirectExecutor(),
    private readonly command = resolveClaudeCommand(),
  ) {}

  async run(input: CliAdapterRunInput, hooks: CliAdapterRunHooks): Promise<CliAdapterRunResult> {
    const workspace = normalizeWorkspacePath(input.workspace);
    let execution: ClaudeDirectCommandExecutionResult;
    try {
      execution = await this.executor.run(
        {
          command: this.command,
          prompt: input.prompt,
          workspace,
          model: input.model,
          permissionMode: input.permissionMode,
          env: input.env,
        },
        hooks,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Claude direct launch failed via '${this.command}': ${detail}`);
    }

    const parsed = parseClaudeDirectResult(execution.stdout);
    const persistedSessionId = String(input.env?.[CLAUDE_SESSION_ID_ENV_VAR] || "").trim() || undefined;

    return {
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      resultText: parsed.resultText,
      rawResult: parsed.rawResult,
      externalSessionId: parsed.sessionId || persistedSessionId,
      externalRequestId: parsed.requestId,
    };
  }
}
