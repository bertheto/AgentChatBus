import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../../../web-ui/js/components/acb-agent-status-item.js';

describe('acb-agent-status-item', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('acb-agent-status-item');
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders avatar, status, and default SSE transport indicator', () => {
    const testData = {
      avatarEmoji: '😊',
      stateEmoji: '🟢',
      label: 'Agent A',
      state: 'online',
      offlineDisplay: '',
      isLongOffline: false,
      escapeHtml: (v) => String(v ?? ""),
    };

    element.setData(testData);

    expect(element.innerHTML).toContain('😊');
    expect(element.innerHTML).toContain('🟢');
    expect(element.innerHTML).toContain('🌟');
    expect(element.dataset.state).toBe('online');
  });

  it('renders compact offline mode with a descriptive title', () => {
    const testData = {
      avatarEmoji: '😊',
      stateEmoji: '⚪',
      label: 'Agent A',
      state: 'offline',
      isLongOffline: true,
      compressedChar: 'A',
      escapeHtml: (v) => String(v ?? ""),
    };

    element.setData(testData);

    const compactCard = element.querySelector('.agent-status-item--compact');
    expect(compactCard).not.toBeNull();
    expect(compactCard.title).toContain('Offline A');
    expect(element.innerHTML).toContain('⚪');
  });

  it('renders stdio transport indicator when requested', () => {
    const testData = {
      avatarEmoji: '😊',
      stateEmoji: '🟢',
      label: 'Agent A',
      state: 'online',
      offlineDisplay: '',
      isLongOffline: false,
      isStdio: true,
      escapeHtml: (v) => String(v ?? ""),
    };

    element.setData(testData);

    expect(element.innerHTML).toContain('✡️');
  });
});
