import { describe, it, expect } from 'vitest';
import '../../../web-ui/js/shared-agent-status.js';

const { deriveUnifiedStatus, getAgentState } = window.AcbAgentStatus;

describe('shared-agent-status unified status', () => {
  it('shows Starting with unknown avatar before bus_connect during startup', () => {
    const status = deriveUnifiedStatus({
      agent: {
        id: 'agent-1',
        display_name: 'Codex',
        emoji: '🤖',
        is_online: true,
        last_activity: 'registered',
      },
      session: {
        state: 'starting',
        participant_display_name: 'Codex',
      },
    });

    expect(status.primaryLabel).toBe('Starting');
    expect(status.avatarEmoji).toBe('❓');
    expect(status.statusText).toBe('Starting');
  });

  it('shows Connecting while running before bus_connect', () => {
    const status = deriveUnifiedStatus({
      agent: {
        is_online: true,
        last_activity: 'heartbeat',
      },
      session: {
        state: 'running',
        output_cursor: 12,
      },
    });

    expect(status.primaryLabel).toBe('Connecting');
    expect(status.avatarEmoji).toBe('❓');
  });

  it('switches to real emoji and msg_wait after bus_connect', () => {
    const status = deriveUnifiedStatus({
      agent: {
        emoji: '🧠',
        is_online: true,
        last_activity: 'msg_wait',
      },
      session: {
        state: 'running',
        connected_at: new Date().toISOString(),
      },
    });

    expect(status.primaryLabel).toBe('Connected');
    expect(status.avatarEmoji).toBe('🧠');
    expect(status.secondaryLabels).toContain('msg_wait');
    expect(status.statusText).toBe('Connected · msg_wait');
  });

  it('merges msg_wait with Thinking without conflicts', () => {
    const status = deriveUnifiedStatus({
      agent: {
        emoji: '🧠',
        is_online: true,
        last_activity: 'msg_wait',
      },
      session: {
        state: 'running',
        connected_at: new Date().toISOString(),
        recent_stream_events: [{ stream: 'thinking' }],
      },
    });

    expect(status.primaryLabel).toBe('Connected');
    expect(status.secondaryLabels).toEqual(['msg_wait', 'Thinking']);
    expect(status.statusText).toBe('Connected · msg_wait · Thinking');
  });

  it('marks terminal session states as disconnected with raw state label', () => {
    const status = deriveUnifiedStatus({
      agent: {
        emoji: '🧠',
        is_online: false,
        last_activity: 'heartbeat',
      },
      session: {
        state: 'stopped',
      },
    });

    expect(status.primaryLabel).toBe('Disconnected');
    expect(status.secondaryLabels).toContain('stopped');
    expect(status.statusText).toBe('Disconnected · stopped');
  });

  it('falls back to connecting for online agents without a session and no bus_connect signal', () => {
    expect(
      getAgentState({
        is_online: true,
        last_activity: 'registered',
      }),
    ).toBe('Connecting');
  });
});
