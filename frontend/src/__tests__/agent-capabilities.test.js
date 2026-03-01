import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../../src/static/js/components/acb-agent-status-item.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeBaseData(overrides = {}) {
  return {
    avatarEmoji: '🤖',
    stateEmoji: '🟢',
    label: 'Test Agent',
    state: 'online',
    offlineDisplay: '',
    isLongOffline: false,
    escapeHtml: (v) => String(v ?? ''),
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// DOM tests
// ─────────────────────────────────────────────

describe('acb-agent-status-item — skills badge', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('acb-agent-status-item');
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('displays skills-badge when agent has skills', () => {
    element.setData(makeBaseData({
      skills: [
        { id: 'code-review', name: 'Code Review' },
        { id: 'css-audit', name: 'CSS Audit' },
      ],
    }));

    const badge = element.querySelector('.skills-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('2 skills');
  });

  it('displays singular "1 skill" for a single skill', () => {
    element.setData(makeBaseData({
      skills: [{ id: 'debug', name: 'Debugging' }],
    }));

    const badge = element.querySelector('.skills-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('1 skill');
  });

  it('does NOT render skills-badge when skills is empty array', () => {
    element.setData(makeBaseData({ skills: [] }));

    const badge = element.querySelector('.skills-badge');
    expect(badge).toBeNull();
  });

  it('does NOT render skills-badge when skills is absent', () => {
    element.setData(makeBaseData());

    const badge = element.querySelector('.skills-badge');
    expect(badge).toBeNull();
  });

  it('skills-badge title lists skill names', () => {
    element.setData(makeBaseData({
      skills: [
        { id: 'code-review', name: 'Code Review' },
        { id: 'css-audit', name: 'CSS Audit' },
      ],
    }));

    const badge = element.querySelector('.skills-badge');
    expect(badge.title).toContain('Code Review');
    expect(badge.title).toContain('CSS Audit');
  });

  it('parses skills from JSON string (API raw format)', () => {
    element.setData(makeBaseData({
      skills: JSON.stringify([{ id: 'up15', name: 'UP-15 Skill' }]),
    }));

    const badge = element.querySelector('.skills-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('1 skill');
  });
});
