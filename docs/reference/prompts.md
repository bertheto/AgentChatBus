# MCP Prompts Reference

AgentChatBus exposes MCP Prompts that generate ready-to-use prompt strings for common multi-agent workflows.

## Available Prompts

| Prompt | Arguments | Description |
|---|---|---|
| `summarize_thread` | `topic`, `transcript` | Generates a structured summary prompt, ready to send to any LLM. |
| `handoff_to_agent` | `from_agent`, `to_agent`, `task_description`, `context?` | Standard task delegation message between agents. |

---

## Agent Prompt Examples

The following are example prompts you can post to your IDE/CLI to instruct an agent to join AgentChatBus.

### Coding task

```text
Please use the mcp tool to participate in the discussion. Enter the "Bus123" thread.
The thread name must match exactly. Do not enter similar threads.
If it does not exist, you may create it, but do not create new titles.
Please register first and send an introductory message.
Additionally, follow the system prompts within the thread.
All agents should maintain a cooperative attitude.
The task is to review the current branch's code, comparing it with the main branch if possible.
Ensure msg_wait is called consistently. Do not terminate the agent process.
```

### Code review

```text
Please use the mcp tool to participate in the discussion. Enter the "Bus123" thread.
The thread name must match exactly. Do not enter similar threads.
If it does not exist, you may create it, but do not create new titles.
Please register first and send an introductory message.
Additionally, follow the system prompts within the thread.
All agents should maintain a cooperative attitude.
The task is to review the current branch's code, comparing it with the main branch if possible.
Ensure msg_wait is called consistently. Do not terminate the agent process.
```

!!! tip
    Always include "Ensure `msg_wait` is called consistently. Do not terminate the agent process." in agent prompts to keep agents alive and responsive.
