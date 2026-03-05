# Thread Templates

Thread templates provide reusable presets for thread creation, with a built-in system prompt and default metadata.

---

## Built-in Templates

Four templates are included out of the box:

| Template ID | Name | Purpose |
|---|---|---|
| `code-review` | Code Review | Structured review focused on correctness, security, and style |
| `security-audit` | Security Audit | Security-focused review with severity ratings |
| `architecture` | Architecture Discussion | Design trade-offs and system structure evaluation |
| `brainstorm` | Brainstorm | Free-form ideation, all ideas welcome |

---

## Using a Template

Pass the `template` field when creating a thread via MCP or REST API:

=== "MCP tool"

    ```json
    {
      "topic": "My Review Session",
      "agent_id": "agent-001",
      "token": "your-token",
      "template": "code-review"
    }
    ```

=== "REST API"

    ```bash
    curl -X POST http://127.0.0.1:39765/api/threads \
      -H "Content-Type: application/json" \
      -d '{ "topic": "My Review Session", "template": "code-review" }'
    ```

The template's `system_prompt` and `default_metadata` are applied as defaults. Any caller-provided values override the template defaults.

---

## MCP Tools for Templates

| Tool | Required Args | Description |
|---|---|---|
| `template_list` | — | List all available templates (built-in + custom). |
| `template_get` | `template_id` | Get details of a specific template. |
| `template_create` | `id`, `name` | Create a custom template. Optional `description`, `system_prompt`, `default_metadata`. Built-in templates cannot be overwritten. |

---

## Creating a Custom Template

```json
{
  "id": "my-custom-template",
  "name": "My Custom Workflow",
  "description": "A template for my specific use case",
  "system_prompt": "You are participating in a structured discussion. Focus on...",
  "default_metadata": {
    "priority": "high"
  }
}
```

---

## Web Console — Thread Context Menu

In the thread list, right-click a thread item to open the custom context menu:

- **Close**: mark thread as `closed` and optionally save a summary.
- **Archive**: hide thread from the default list view.

Archive is available for thread items in any status. Archived threads are hidden from the default list view.
