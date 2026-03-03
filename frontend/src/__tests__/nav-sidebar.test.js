import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * UI-07 - Message Navigation Rail (Emoji Minimap)
 *
 * Tests for the logic in shared-nav-sidebar.js extracted in isolation:
 *   1. isEnabled() reads localStorage correctly (default = true)
 *   2. applyEnabledState() toggles body.minimap-hidden class
 *   3. setEnabled() writes to localStorage and updates class
 *   4. buildRail() creates .nav-dot elements from .msg-row DOM
 *   5. Dots carry data-seq and data-author-id attributes
 *   6. Dots use emoji from .msg-avatar element
 *   7. Click on dot triggers scrollIntoView
 *   8. buildRail() on empty thread leaves rail empty
 *   9. onNewMessage() after appendBubble rebuilds the rail
 *  10. Dots reposition on scroll (positionDots called)
 */

const STORAGE_KEY = 'acb-minimap-enabled';

function makeNavSidebar({ document, localStorage }) {
  let _scrollListener = null;

  function isEnabled() {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === 'true';
  }

  function applyEnabledState() {
    document.body.classList.toggle('minimap-hidden', !isEnabled());
  }

  function setEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    document.body.classList.toggle('minimap-hidden', !enabled);
  }

  function positionDots() {
    const rail = document.getElementById('nav-rail');
    const messagesEl = document.getElementById('messages');
    if (!rail || !messagesEl) return;
    const dots = rail.querySelectorAll('.nav-dot');
    const rows = messagesEl.querySelectorAll('.msg-row[data-seq]');
    if (dots.length !== rows.length) { buildRail(); return; }
    const scrollTop = messagesEl.scrollTop || 0;
    rows.forEach((row, i) => {
      const dot = dots[i];
      if (!dot) return;
      dot.style.top = (row.offsetTop - scrollTop) + 'px';
    });
  }

  function buildRail() {
    const rail = document.getElementById('nav-rail');
    const messagesEl = document.getElementById('messages');
    if (!rail || !messagesEl) return;

    if (_scrollListener) {
      messagesEl.removeEventListener('scroll', _scrollListener);
      _scrollListener = null;
    }

    rail.innerHTML = '';

    const rows = messagesEl.querySelectorAll('.msg-row[data-seq]');
    if (rows.length === 0) return;

    const scrollTop = messagesEl.scrollTop || 0;

    rows.forEach((row) => {
      const seq = row.getAttribute('data-seq');
      const authorId = row.getAttribute('data-author-id') || 'unknown';
      const avatarEl = row.querySelector('.msg-avatar');
      const emoji = avatarEl ? avatarEl.textContent.trim() : '💬';
      const authorNameEl = row.querySelector('.msg-author-label');
      const authorName = authorNameEl ? authorNameEl.textContent.trim() : authorId;

      const dot = document.createElement('button');
      dot.className = 'nav-dot';
      dot.setAttribute('data-seq', seq);
      dot.setAttribute('data-author-id', authorId);
      dot.setAttribute('title', authorName);
      dot.textContent = emoji;
      dot.style.top = (row.offsetTop - scrollTop) + 'px';

      dot.addEventListener('click', () => {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('nav-highlight');
        setTimeout(() => row.classList.remove('nav-highlight'), 1200);
      });

      rail.appendChild(dot);
    });

    _scrollListener = positionDots;
    messagesEl.addEventListener('scroll', _scrollListener, { passive: true });
  }

  return { isEnabled, applyEnabledState, setEnabled, rebuild: buildRail, onNewMessage: buildRail, positionDots };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRailDOM(document) {
  const messagesWrap = document.createElement('div');
  messagesWrap.id = 'messages-wrap';

  const messagesEl = document.createElement('div');
  messagesEl.id = 'messages';
  messagesWrap.appendChild(messagesEl);

  const rail = document.createElement('div');
  rail.id = 'nav-rail';
  messagesWrap.appendChild(rail);

  document.body.appendChild(messagesWrap);
  return { messagesEl, rail };
}

function createMsgRow(messagesEl, { seq, authorId, authorName, emoji = '🤖' }) {
  const row = document.createElement('div');
  row.className = 'msg-row';
  row.setAttribute('data-seq', String(seq));
  row.setAttribute('data-author-id', authorId);

  const avatar = document.createElement('span');
  avatar.className = 'msg-avatar';
  avatar.textContent = emoji;
  row.appendChild(avatar);

  const label = document.createElement('span');
  label.className = 'msg-author-label';
  label.textContent = authorName;
  row.appendChild(label);

  messagesEl.appendChild(row);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UI-07 — NavRail (Emoji Minimap)', () => {
  let nav;
  let localStorageMock;

  beforeEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';

    const store = {};
    localStorageMock = {
      getItem: vi.fn((k) => store[k] ?? null),
      setItem: vi.fn((k, v) => { store[k] = v; }),
      _store: store,
    };

    nav = makeNavSidebar({ document, localStorage: localStorageMock });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. Default enabled state
  it('isEnabled() returns true when localStorage has no value', () => {
    expect(nav.isEnabled()).toBe(true);
  });

  // 2. Disabled from localStorage
  it('isEnabled() returns false when localStorage is "false"', () => {
    localStorageMock._store[STORAGE_KEY] = 'false';
    expect(nav.isEnabled()).toBe(false);
  });

  // 3. applyEnabledState adds minimap-hidden when disabled
  it('applyEnabledState() adds minimap-hidden to body when disabled', () => {
    localStorageMock._store[STORAGE_KEY] = 'false';
    nav.applyEnabledState();
    expect(document.body.classList.contains('minimap-hidden')).toBe(true);
  });

  // 4. applyEnabledState removes minimap-hidden when enabled
  it('applyEnabledState() removes minimap-hidden from body when enabled', () => {
    document.body.classList.add('minimap-hidden');
    localStorageMock._store[STORAGE_KEY] = 'true';
    nav.applyEnabledState();
    expect(document.body.classList.contains('minimap-hidden')).toBe(false);
  });

  // 5. setEnabled persists and updates class
  it('setEnabled(false) writes localStorage and adds minimap-hidden', () => {
    nav.setEnabled(false);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'false');
    expect(document.body.classList.contains('minimap-hidden')).toBe(true);
  });

  it('setEnabled(true) writes localStorage and removes minimap-hidden', () => {
    document.body.classList.add('minimap-hidden');
    nav.setEnabled(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'true');
    expect(document.body.classList.contains('minimap-hidden')).toBe(false);
  });

  // 6. buildRail creates one .nav-dot per msg-row
  it('rebuild() creates one .nav-dot per .msg-row[data-seq]', () => {
    const { messagesEl } = createRailDOM(document);
    createMsgRow(messagesEl, { seq: 1, authorId: 'agent-a', authorName: 'Agent A', emoji: '🤖' });
    createMsgRow(messagesEl, { seq: 2, authorId: 'agent-b', authorName: 'Agent B', emoji: '🧠' });
    createMsgRow(messagesEl, { seq: 3, authorId: 'agent-a', authorName: 'Agent A', emoji: '🤖' });

    nav.rebuild();

    const dots = document.querySelectorAll('.nav-dot');
    expect(dots).toHaveLength(3);
  });

  // 7. Dots carry correct attributes
  it('dots carry correct data-seq and data-author-id', () => {
    const { messagesEl } = createRailDOM(document);
    createMsgRow(messagesEl, { seq: 5, authorId: 'agent-x', authorName: 'Agent X', emoji: '👾' });

    nav.rebuild();

    const dot = document.querySelector('.nav-dot');
    expect(dot.getAttribute('data-seq')).toBe('5');
    expect(dot.getAttribute('data-author-id')).toBe('agent-x');
    expect(dot.textContent).toBe('👾');
  });

  // 8. Empty thread leaves rail empty
  it('rebuild() on empty thread leaves #nav-rail empty', () => {
    const { rail } = createRailDOM(document);
    nav.rebuild();
    expect(rail.children).toHaveLength(0);
  });

  // 9. Click on dot calls scrollIntoView
  it('clicking a dot calls scrollIntoView on the corresponding msg-row', () => {
    const { messagesEl } = createRailDOM(document);
    const row = createMsgRow(messagesEl, { seq: 7, authorId: 'bot', authorName: 'Bot', emoji: '🤖' });
    row.scrollIntoView = vi.fn();

    nav.rebuild();

    const dot = document.querySelector('.nav-dot[data-seq="7"]');
    dot.click();
    expect(row.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  // 10. onNewMessage() rebuilds and adds new dot
  it('onNewMessage() adds a dot for each new message', () => {
    const { messagesEl } = createRailDOM(document);
    createMsgRow(messagesEl, { seq: 1, authorId: 'a', authorName: 'A', emoji: '🤖' });
    nav.onNewMessage();
    expect(document.querySelectorAll('.nav-dot')).toHaveLength(1);

    createMsgRow(messagesEl, { seq: 2, authorId: 'b', authorName: 'B', emoji: '🧠' });
    nav.onNewMessage();
    expect(document.querySelectorAll('.nav-dot')).toHaveLength(2);
  });

  // 11. Fallback emoji when no avatar
  it('uses 💬 as fallback emoji when no .msg-avatar element', () => {
    const { messagesEl } = createRailDOM(document);
    const row = document.createElement('div');
    row.className = 'msg-row';
    row.setAttribute('data-seq', '1');
    row.setAttribute('data-author-id', 'x');
    messagesEl.appendChild(row);

    nav.rebuild();

    const dot = document.querySelector('.nav-dot');
    expect(dot.textContent).toBe('💬');
  });

  // 12. Scroll listener attached after buildRail
  it('scroll listener is attached to #messages after rebuild()', () => {
    const { messagesEl } = createRailDOM(document);
    const addSpy = vi.spyOn(messagesEl, 'addEventListener');
    createMsgRow(messagesEl, { seq: 1, authorId: 'a', authorName: 'A', emoji: '🤖' });

    nav.rebuild();

    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
  });

  // 13. Previous scroll listener removed on rebuild
  it('old scroll listener is removed before new one is attached', () => {
    const { messagesEl } = createRailDOM(document);
    const removeSpy = vi.spyOn(messagesEl, 'removeEventListener');
    createMsgRow(messagesEl, { seq: 1, authorId: 'a', authorName: 'A', emoji: '🤖' });

    nav.rebuild();  // first build attaches listener
    nav.rebuild();  // second build should remove then re-attach

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
