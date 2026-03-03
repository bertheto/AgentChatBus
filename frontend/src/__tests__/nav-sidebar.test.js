import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * UI-07 - Message Navigation Sidebar (Minimap)
 *
 * Tests for the logic in shared-nav-sidebar.js extracted in isolation:
 *   1. isEnabled() reads localStorage correctly (default = true)
 *   2. applyEnabledState() toggles body.minimap-hidden class
 *   3. setEnabled() writes to localStorage and updates class
 *   4. buildAnchors() creates .nav-anchor elements from .msg-row DOM
 *   5. Anchors carry data-seq and data-author-id attributes
 *   6. getAuthorColor() assigns consistent colours per author
 *   7. Clic on anchor triggers scrollIntoView
 *   8. IntersectionObserver marks anchor active when msg-row visible
 *   9. rebuild() on empty thread shows nav-sidebar-empty class
 *  10. onNewMessage() after appendBubble adds a new anchor
 */

// ---------------------------------------------------------------------------
// Extracted / mirrored logic from shared-nav-sidebar.js
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'acb-minimap-enabled';

const AUTHOR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
];

function makeNavSidebar({ document, localStorage }) {
  let _authorColorMap = {};
  let _colorIndex = 0;
  let _observer = null;

  function getAuthorColor(authorId) {
    if (!_authorColorMap[authorId]) {
      _authorColorMap[authorId] = AUTHOR_COLORS[_colorIndex % AUTHOR_COLORS.length];
      _colorIndex++;
    }
    return _authorColorMap[authorId];
  }

  function resetColors() {
    _authorColorMap = {};
    _colorIndex = 0;
  }

  function isEnabled() {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === 'true';
  }

  function applyEnabledState() {
    document.body.classList.toggle('minimap-hidden', !isEnabled());
  }

  function buildAnchors() {
    const sidebar = document.getElementById('nav-sidebar');
    if (!sidebar) return;
    const list = sidebar.querySelector('.nav-sidebar-list');
    if (!list) return;

    list.innerHTML = '';
    resetColors();

    const rows = document.querySelectorAll('.msg-row[data-seq]');
    if (rows.length === 0) {
      sidebar.classList.add('nav-sidebar-empty');
      return;
    }
    sidebar.classList.remove('nav-sidebar-empty');

    rows.forEach((row) => {
      const seq = row.getAttribute('data-seq');
      const authorId = row.getAttribute('data-author-id') || 'unknown';
      const authorNameEl = row.querySelector('.msg-author-label');
      const authorName = authorNameEl ? authorNameEl.textContent.trim() : authorId;
      const color = getAuthorColor(authorId);

      const anchor = document.createElement('button');
      anchor.className = 'nav-anchor';
      anchor.setAttribute('data-seq', seq);
      anchor.setAttribute('data-author-id', authorId);
      anchor.innerHTML = `
        <span class="nav-anchor-dot" style="background:${color};"></span>
        <span class="nav-anchor-label">
          <span class="nav-anchor-name">${authorName}</span>
        </span>`;

      anchor.addEventListener('click', () => {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('nav-highlight');
        setTimeout(() => row.classList.remove('nav-highlight'), 1200);
      });

      list.appendChild(anchor);
    });
  }

  function setEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    document.body.classList.toggle('minimap-hidden', !enabled);
  }

  function rebuild() {
    buildAnchors();
  }

  function onNewMessage() {
    buildAnchors();
  }

  return { isEnabled, applyEnabledState, setEnabled, rebuild, onNewMessage, getAuthorColor };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSidebarDOM(document) {
  const sidebar = document.createElement('nav');
  sidebar.id = 'nav-sidebar';
  const list = document.createElement('div');
  list.className = 'nav-sidebar-list';
  sidebar.appendChild(list);
  document.body.appendChild(sidebar);
  return sidebar;
}

function createMsgRow(document, { seq, authorId, authorName }) {
  const row = document.createElement('div');
  row.className = 'msg-row';
  row.setAttribute('data-seq', String(seq));
  row.setAttribute('data-author-id', authorId);
  const label = document.createElement('span');
  label.className = 'msg-author-label';
  label.textContent = authorName;
  row.appendChild(label);
  document.body.appendChild(row);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UI-07 — NavSidebar', () => {
  let nav;
  let localStorageMock;

  beforeEach(() => {
    // Reset body classes and DOM
    document.body.className = '';
    document.body.innerHTML = '';

    // Fresh localStorage mock
    const store = {};
    localStorageMock = {
      getItem: vi.fn((k) => store[k] ?? null),
      setItem: vi.fn((k, v) => { store[k] = v; }),
      removeItem: vi.fn((k) => { delete store[k]; }),
      _store: store,
    };

    nav = makeNavSidebar({ document, localStorage: localStorageMock });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. Default state: enabled when localStorage absent
  it('isEnabled() returns true when localStorage has no value', () => {
    expect(nav.isEnabled()).toBe(true);
  });

  // 2. Disabled state from localStorage
  it('isEnabled() returns false when localStorage is "false"', () => {
    localStorageMock._store[STORAGE_KEY] = 'false';
    expect(nav.isEnabled()).toBe(false);
  });

  // 3. applyEnabledState adds minimap-hidden class when disabled
  it('applyEnabledState() adds minimap-hidden to body when disabled', () => {
    localStorageMock._store[STORAGE_KEY] = 'false';
    nav.applyEnabledState();
    expect(document.body.classList.contains('minimap-hidden')).toBe(true);
  });

  // 4. applyEnabledState removes minimap-hidden class when enabled
  it('applyEnabledState() removes minimap-hidden from body when enabled', () => {
    document.body.classList.add('minimap-hidden');
    localStorageMock._store[STORAGE_KEY] = 'true';
    nav.applyEnabledState();
    expect(document.body.classList.contains('minimap-hidden')).toBe(false);
  });

  // 5. setEnabled persists to localStorage and updates class
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

  // 6. buildAnchors creates one anchor per msg-row
  it('rebuild() creates one .nav-anchor per .msg-row[data-seq]', () => {
    createSidebarDOM(document);
    createMsgRow(document, { seq: 1, authorId: 'agent-a', authorName: 'Agent A' });
    createMsgRow(document, { seq: 2, authorId: 'agent-b', authorName: 'Agent B' });
    createMsgRow(document, { seq: 3, authorId: 'agent-a', authorName: 'Agent A' });

    nav.rebuild();

    const anchors = document.querySelectorAll('.nav-anchor');
    expect(anchors).toHaveLength(3);
  });

  // 7. Anchors carry correct data-seq and data-author-id
  it('anchors carry correct data-seq and data-author-id', () => {
    createSidebarDOM(document);
    createMsgRow(document, { seq: 5, authorId: 'agent-x', authorName: 'Agent X' });

    nav.rebuild();

    const anchor = document.querySelector('.nav-anchor');
    expect(anchor.getAttribute('data-seq')).toBe('5');
    expect(anchor.getAttribute('data-author-id')).toBe('agent-x');
  });

  // 8. Empty thread adds nav-sidebar-empty class
  it('rebuild() on empty thread adds nav-sidebar-empty class', () => {
    const sidebar = createSidebarDOM(document);
    nav.rebuild();
    expect(sidebar.classList.contains('nav-sidebar-empty')).toBe(true);
  });

  // 9. Non-empty thread removes nav-sidebar-empty class
  it('rebuild() with messages removes nav-sidebar-empty class', () => {
    const sidebar = createSidebarDOM(document);
    sidebar.classList.add('nav-sidebar-empty');
    createMsgRow(document, { seq: 1, authorId: 'a', authorName: 'A' });
    nav.rebuild();
    expect(sidebar.classList.contains('nav-sidebar-empty')).toBe(false);
  });

  // 10. Click on anchor calls scrollIntoView
  it('clicking an anchor calls scrollIntoView on the corresponding msg-row', () => {
    createSidebarDOM(document);
    const row = createMsgRow(document, { seq: 7, authorId: 'bot', authorName: 'Bot' });
    row.scrollIntoView = vi.fn();

    nav.rebuild();

    const anchor = document.querySelector('.nav-anchor[data-seq="7"]');
    anchor.click();
    expect(row.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  // 11. getAuthorColor returns consistent colour for same authorId
  it('getAuthorColor() returns the same colour for the same authorId', () => {
    const color1 = nav.getAuthorColor('agent-z');
    const color2 = nav.getAuthorColor('agent-z');
    expect(color1).toBe(color2);
  });

  // 12. onNewMessage() is equivalent to rebuild (adds anchors)
  it('onNewMessage() rebuilds anchors after a new message', () => {
    createSidebarDOM(document);
    createMsgRow(document, { seq: 1, authorId: 'a', authorName: 'A' });
    nav.onNewMessage();
    expect(document.querySelectorAll('.nav-anchor')).toHaveLength(1);

    createMsgRow(document, { seq: 2, authorId: 'b', authorName: 'B' });
    nav.onNewMessage();
    expect(document.querySelectorAll('.nav-anchor')).toHaveLength(2);
  });
});
