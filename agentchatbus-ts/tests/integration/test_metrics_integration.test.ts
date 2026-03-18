import { beforeEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/transports/http/server.js';

describe('Metrics Integration (Ported from tests/test_metrics.py)', () => {
  async function createAuthedThread(server: ReturnType<typeof createHttpServer>, topic: string) {
    const auth = (await server.inject({
      method: 'POST',
      url: '/api/agents/register',
      payload: { ide: 'Test', model: 'metrics-thread-creator' }
    })).json() as any;
    const threadResp = await server.inject({
      method: 'POST',
      url: '/api/threads',
      headers: { 'x-agent-token': auth.token },
      payload: { topic, creator_agent_id: auth.agent_id }
    });
    expect(threadResp.statusCode).toBe(201);
    return threadResp.json();
  }

  beforeEach(() => {
    process.env.AGENTCHATBUS_TEST_DB = ':memory:';
  });

  it('GET /api/metrics returns 200 with required top-level keys', async () => {
    const server = createHttpServer();

    const resp = await server.inject({ method: 'GET', url: '/api/metrics' });
    expect(resp.statusCode).toBe(200);

    const body = resp.json() as any;
    for (const key of ['uptime_seconds', 'started_at', 'schema_version', 'threads', 'messages', 'agents']) {
      expect(body).toHaveProperty(key);
    }

    await server.close();
  });

  it('GET /api/metrics reflects thread and message increments', async () => {
    const server = createHttpServer();

    const before = (await server.inject({ method: 'GET', url: '/api/metrics' })).json() as any;

    const thread = await createAuthedThread(server, 'metrics-thread');

    await server.inject({
      method: 'POST',
      url: `/api/threads/${thread.id}/messages`,
      payload: {
        author: 'human',
        content: 'hello metrics',
        expected_last_seq: thread.current_seq,
        reply_token: thread.reply_token
      }
    });

    const after = (await server.inject({ method: 'GET', url: '/api/metrics' })).json() as any;
    expect(after.threads.total).toBe(before.threads.total + 1);
    expect(after.messages.total).toBe(before.messages.total + 1);

    await server.close();
  });

  it('GET /health remains lightweight without metrics payload', async () => {
    const server = createHttpServer();

    const resp = await server.inject({ method: 'GET', url: '/health' });
    expect(resp.statusCode).toBe(200);

    const body = resp.json() as any;
    expect(body).not.toHaveProperty('uptime_seconds');
    expect(body).not.toHaveProperty('threads');
    expect(body).not.toHaveProperty('messages');

    await server.close();
  });
});
