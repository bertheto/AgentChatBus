import { describe, it, expect } from 'vitest';
import { listTools } from '../src/adapters/mcp/tools';

function findArrayWithoutItems(obj: unknown, path = ''): string[] {
  const errors: string[] = [];
  if (obj === null || obj === undefined) return errors;
  if (typeof obj !== 'object') return errors;
  const o = obj as Record<string, any>;

  if (o.type === 'array' && !Object.prototype.hasOwnProperty.call(o, 'items')) {
    errors.push(path || '(root)');
  }

  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') {
      const subPath = path ? `${path}.${k}` : k;
      errors.push(...findArrayWithoutItems(v, subPath));
    }
  }

  return errors;
}

describe('MCP tool inputSchema array-items validation', () => {
  it('includes close_meeting with explicit admin credentials', () => {
    const tools = listTools();
    const closeMeeting = tools.find((tool) => tool.name === 'close_meeting');

    expect(closeMeeting).toBeDefined();
    expect(closeMeeting?.inputSchema).toMatchObject({
      required: ['thread_id', 'agent_id', 'token'],
    });
  });

  it('all array typed schemas must include `items` (deep check)', () => {
    const tools = listTools();
    const failures: { tool: string; locations: string[] }[] = [];

    for (const t of tools) {
      const locations = findArrayWithoutItems(t.inputSchema);
      if (locations.length > 0) {
        failures.push({ tool: t.name, locations });
      }
    }

    if (failures.length > 0) {
      // Pretty-print failures for easier debugging
      const message = failures
        .map(f => `${f.tool}: missing items at ${f.locations.join(', ')}`)
        .join('\n');
      // Fail the test with details
      expect(failures).toEqual([]);
      throw new Error(message);
    }

    // If none failed, assert true to make the test explicit
    expect(failures.length).toBe(0);
  });
});
