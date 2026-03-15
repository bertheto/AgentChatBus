import { memoryStore } from "../../core/services/memoryStore.js";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const toolDefinitions: ToolDefinition[] = [
  { name: "thread_create", description: "Create a thread and return sync context.", inputSchema: { type: "object", required: ["topic"] } },
  { name: "thread_list", description: "List threads.", inputSchema: { type: "object" } },
  { name: "thread_get", description: "Get thread details.", inputSchema: { type: "object", required: ["thread_id"] } },
  { name: "thread_delete", description: "Delete a thread.", inputSchema: { type: "object", required: ["thread_id"] } },
  { name: "thread_settings_get", description: "Get thread settings.", inputSchema: { type: "object", required: ["thread_id"] } },
  { name: "thread_settings_update", description: "Update thread settings.", inputSchema: { type: "object", required: ["thread_id"] } },
  { name: "msg_post", description: "Post a message to a thread.", inputSchema: { type: "object", required: ["thread_id", "author", "content", "expected_last_seq", "reply_token"] } },
  { name: "msg_list", description: "List messages in a thread.", inputSchema: { type: "object", required: ["thread_id"] } },
  { name: "msg_get", description: "Get a message by ID.", inputSchema: { type: "object", required: ["message_id"] } },
  { name: "msg_wait", description: "Return available messages and new sync context.", inputSchema: { type: "object", required: ["thread_id", "after_seq"] } },
  { name: "template_list", description: "List templates.", inputSchema: { type: "object" } },
  { name: "template_get", description: "Get template by ID.", inputSchema: { type: "object", required: ["template_id"] } },
  { name: "template_create", description: "Create a template.", inputSchema: { type: "object", required: ["id", "name"] } },
  { name: "agent_register", description: "Register an agent.", inputSchema: { type: "object", required: ["ide", "model"] } },
  { name: "agent_heartbeat", description: "Heartbeat an agent.", inputSchema: { type: "object", required: ["agent_id", "token"] } },
  { name: "agent_resume", description: "Resume an agent.", inputSchema: { type: "object", required: ["agent_id", "token"] } },
  { name: "agent_unregister", description: "Unregister an agent.", inputSchema: { type: "object", required: ["agent_id", "token"] } },
  { name: "agent_list", description: "List agents.", inputSchema: { type: "object" } },
  { name: "agent_update", description: "Update an agent.", inputSchema: { type: "object", required: ["agent_id", "token"] } },
  { name: "agent_set_typing", description: "Set typing indicator.", inputSchema: { type: "object", required: ["thread_id", "agent_id", "is_typing"] } },
  { name: "msg_react", description: "React to a message.", inputSchema: { type: "object", required: ["message_id", "agent_id", "reaction"] } },
  { name: "msg_unreact", description: "Remove a reaction from a message.", inputSchema: { type: "object", required: ["message_id", "agent_id", "reaction"] } },
  { name: "bus_connect", description: "Connect agent and join/create a thread.", inputSchema: { type: "object", required: ["thread_name"] } },
  { name: "bus_get_config", description: "Get bus config.", inputSchema: { type: "object" } },
  { name: "msg_search", description: "Search messages.", inputSchema: { type: "object", required: ["query"] } },
  { name: "msg_edit", description: "Edit a message.", inputSchema: { type: "object", required: ["message_id", "new_content"] } },
  { name: "msg_edit_history", description: "Get message edit history.", inputSchema: { type: "object", required: ["message_id"] } }
];

export function listTools(): ToolDefinition[] {
  return toolDefinitions;
}

export function callTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "thread_create": {
      const created = memoryStore.createThread(String(args.topic || ""), typeof args.system_prompt === "string" ? args.system_prompt : undefined);
      return {
        thread: created.thread,
        current_seq: created.sync.current_seq,
        reply_token: created.sync.reply_token,
        reply_window: created.sync.reply_window
      };
    }
    case "thread_list":
      return { threads: memoryStore.getThreads(Boolean(args.include_archived)) };
    case "thread_get":
      return memoryStore.getThread(String(args.thread_id || "")) || { found: false };
    case "thread_delete":
      return { ok: memoryStore.deleteThread(String(args.thread_id || "")) };
    case "thread_settings_get":
      return memoryStore.getThreadSettings(String(args.thread_id || "")) || { found: false };
    case "thread_settings_update":
      return memoryStore.updateThreadSettings(String(args.thread_id || ""), {
        auto_administrator_enabled: typeof args.auto_administrator_enabled === "boolean" ? args.auto_administrator_enabled : undefined,
        timeout_seconds: typeof args.timeout_seconds === "number" ? args.timeout_seconds : undefined,
        switch_timeout_seconds: typeof args.switch_timeout_seconds === "number" ? args.switch_timeout_seconds : undefined
      }) || { found: false };
    case "msg_post":
      return memoryStore.postMessage({
        threadId: String(args.thread_id || ""),
        author: String(args.author || "human"),
        content: String(args.content || ""),
        expectedLastSeq: Number(args.expected_last_seq),
        replyToken: String(args.reply_token || ""),
        role: typeof args.role === "string" ? args.role : undefined,
        priority: typeof args.priority === "string" ? args.priority : undefined,
        metadata: typeof args.metadata === "object" && args.metadata !== null ? args.metadata as Record<string, unknown> : undefined,
        replyToMsgId: typeof args.reply_to_msg_id === "string" ? args.reply_to_msg_id : undefined
      });
    case "msg_list":
      return { messages: memoryStore.getMessages(String(args.thread_id || ""), Number(args.after_seq || 0)) };
    case "msg_get":
      return memoryStore.getMessage(String(args.message_id || "")) || { found: false };
    case "msg_wait": {
      const threadId = String(args.thread_id || "");
      return memoryStore.waitForMessages({
        threadId,
        afterSeq: Number(args.after_seq || 0),
        agentId: typeof args.agent_id === "string" ? args.agent_id : undefined,
        timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined
      });
    }
    case "template_list":
      return { templates: memoryStore.getTemplates() };
    case "template_get":
      return { found: false };
    case "template_create":
      return { ok: true, template: args };
    case "agent_register":
      return memoryStore.registerAgent({
        ide: String(args.ide || "CLI"),
        model: String(args.model || "unknown"),
        description: typeof args.description === "string" ? args.description : undefined,
        display_name: typeof args.display_name === "string" ? args.display_name : undefined,
        capabilities: Array.isArray(args.capabilities) ? args.capabilities.map(String) : undefined,
        skills: Array.isArray(args.skills) ? args.skills : undefined
      });
    case "agent_heartbeat":
      return { ok: memoryStore.heartbeatAgent(String(args.agent_id || ""), String(args.token || "")) };
    case "agent_resume":
      return memoryStore.resumeAgent(String(args.agent_id || ""), String(args.token || "")) || { found: false };
    case "agent_unregister":
      return { ok: memoryStore.unregisterAgent(String(args.agent_id || ""), String(args.token || "")) };
    case "agent_list":
      return { agents: memoryStore.listAgents() };
    case "agent_update":
      return memoryStore.updateAgent(String(args.agent_id || ""), String(args.token || ""), {
        description: typeof args.description === "string" ? args.description : undefined,
        display_name: typeof args.display_name === "string" ? args.display_name : undefined,
        capabilities: Array.isArray(args.capabilities) ? args.capabilities.map(String) : undefined,
        skills: Array.isArray(args.skills) ? args.skills : undefined
      }) || { found: false };
    case "agent_set_typing":
      return { ok: true, thread_id: args.thread_id, agent_id: args.agent_id, is_typing: args.is_typing };
    case "msg_react":
      return memoryStore.addReaction(String(args.message_id || ""), String(args.agent_id || ""), String(args.reaction || "")) || { found: false };
    case "msg_unreact":
      return memoryStore.removeReaction(String(args.message_id || ""), String(args.agent_id || ""), String(args.reaction || "")) || { found: false };
    case "bus_connect": {
      const threadName = String(args.thread_name || "");
      const created = memoryStore.createThread(threadName, typeof args.system_prompt === "string" ? args.system_prompt : undefined);
      const resumed = typeof args.agent_id === "string" && typeof args.token === "string"
        ? memoryStore.resumeAgent(args.agent_id, args.token)
        : undefined;
      const agent = resumed || memoryStore.registerAgent({
        ide: typeof args.ide === "string" ? args.ide : "CLI",
        model: typeof args.model === "string" ? args.model : "unknown",
        description: typeof args.description === "string" ? args.description : undefined,
        display_name: typeof args.display_name === "string" ? args.display_name : undefined,
        capabilities: Array.isArray(args.capabilities) ? args.capabilities.map(String) : undefined,
        skills: Array.isArray(args.skills) ? args.skills : undefined
      });
      const isAdministrator = memoryStore.getMessages(created.thread.id, 0).length === 0;
      return {
        agent: {
          ...agent,
          is_administrator: isAdministrator,
          role_assignment: isAdministrator
            ? `You are the administrator for thread ${created.thread.topic}. Coordinate work and keep progress moving.`
            : `Wait for instructions from the administrator in thread ${created.thread.topic}.`
        },
        thread: created.thread,
        messages: memoryStore.getMessages(created.thread.id, Number(args.after_seq || 0)),
        current_seq: created.sync.current_seq,
        reply_token: created.sync.reply_token,
        reply_window: created.sync.reply_window
      };
    }
    case "bus_get_config":
      return memoryStore.getSettings();
    case "msg_search":
      return { results: memoryStore.searchMessages(String(args.query || "")) };
    case "msg_edit":
      return memoryStore.editMessage(String(args.message_id || ""), String(args.new_content || "")) || { found: false };
    case "msg_edit_history":
      return { edits: memoryStore.getMessageHistory(String(args.message_id || "")) };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}