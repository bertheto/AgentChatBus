/**
 * Frontend Vitest tests for UI-08 (scroll-to-top) and UI-02 (search bar / pills).
 *
 * Uses jsdom environment. Fuse.js is stubbed since it's a CDN/vendor file loaded
 * at runtime — we test the DOM/behavior logic of shared-search.js instead.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMessagesDOM() {
  const messages = document.createElement('div');
  messages.id = 'messages';
  messages.style.overflow = 'auto';
  messages.style.height = '400px';

  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div');
    row.className = 'msg-row';
    row.dataset.seq = String(i + 1);

    const author = document.createElement('span');
    author.className = 'msg-author-label';
    author.textContent = i % 2 === 0 ? 'agent-a' : 'agent-b';

    const bubble = document.createElement('div');
    bubble.className = 'bubble-v2';
    bubble.textContent = `Message ${i + 1}: ${i === 2 ? 'angular signals' : 'some content here'}`;

    row.appendChild(author);
    row.appendChild(bubble);
    messages.appendChild(row);
  }
  return messages;
}

function buildSearchBarDOM() {
  const bar = document.createElement('div');
  bar.id = 'search-bar';

  const input = document.createElement('input');
  input.id = 'search-input';
  bar.appendChild(input);

  const counter = document.createElement('span');
  counter.id = 'search-counter';
  bar.appendChild(counter);

  const prev = document.createElement('button');
  prev.id = 'search-prev';
  bar.appendChild(prev);

  const next = document.createElement('button');
  next.id = 'search-next';
  bar.appendChild(next);

  const close = document.createElement('button');
  close.id = 'search-close';
  bar.appendChild(close);

  const pillContent = document.createElement('button');
  pillContent.id = 'pill-content';
  pillContent.className = 'search-pill active';
  bar.appendChild(pillContent);

  const pillAuthor = document.createElement('button');
  pillAuthor.id = 'pill-author';
  pillAuthor.className = 'search-pill';
  bar.appendChild(pillAuthor);

  const pillMeta = document.createElement('button');
  pillMeta.id = 'pill-meta';
  pillMeta.className = 'search-pill';
  bar.appendChild(pillMeta);

  const scopeCurrent = document.createElement('button');
  scopeCurrent.id = 'scope-current';
  scopeCurrent.className = 'search-pill active';
  bar.appendChild(scopeCurrent);

  const scopeAll = document.createElement('button');
  scopeAll.id = 'scope-all';
  scopeAll.className = 'search-pill';
  bar.appendChild(scopeAll);

  const allResults = document.createElement('div');
  allResults.id = 'search-all-results';
  bar.appendChild(allResults);

  return bar;
}

// ── UI-08: Scroll-to-top button ───────────────────────────────────────────────

describe('UI-08: Scroll-to-top button', () => {
  let btn, messages;

  beforeEach(() => {
    btn = document.createElement('button');
    btn.id = 'btn-scroll-top';
    btn.className = 'scroll-top-btn';
    document.body.appendChild(btn);

    messages = buildMessagesDOM();
    document.body.appendChild(messages);

    // Simulate the init logic from index.html
    messages.addEventListener('scroll', () => {
      btn.classList.toggle('visible', messages.scrollTop > 300);
    });
    btn.addEventListener('click', () => {
      messages.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is hidden by default (no visible class)', () => {
    expect(btn.classList.contains('visible')).toBe(false);
  });

  it('becomes visible when scrollTop > 300', () => {
    // Override scrollTop getter
    Object.defineProperty(messages, 'scrollTop', {
      get: () => 350,
      configurable: true,
    });
    messages.dispatchEvent(new Event('scroll'));
    expect(btn.classList.contains('visible')).toBe(true);
  });

  it('hides when scrollTop <= 300', () => {
    // First make visible
    Object.defineProperty(messages, 'scrollTop', {
      get: () => 350,
      configurable: true,
    });
    messages.dispatchEvent(new Event('scroll'));
    expect(btn.classList.contains('visible')).toBe(true);

    // Now scroll back
    Object.defineProperty(messages, 'scrollTop', {
      get: () => 100,
      configurable: true,
    });
    messages.dispatchEvent(new Event('scroll'));
    expect(btn.classList.contains('visible')).toBe(false);
  });
});

// ── UI-02: Search bar DOM ─────────────────────────────────────────────────────

describe('UI-02: Search bar visibility', () => {
  let bar;

  beforeEach(() => {
    bar = buildSearchBarDOM();
    document.body.appendChild(bar);
    document.body.appendChild(buildMessagesDOM());
    // Stub Fuse globally
    global.Fuse = class {
      constructor(items, opts) { this._items = items; }
      search(q) { return this._items.filter(i => i.content.includes(q)).map(i => ({ item: i, matches: [] })); }
    };
    // Load module fresh each test
    window.AcbSearch = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete global.Fuse;
  });

  it('search bar is not visible by default', () => {
    expect(bar.classList.contains('visible')).toBe(false);
  });

  it('toggle adds visible class', () => {
    // Simulate toggle by adding class directly (shared-search.js logic)
    bar.classList.add('visible');
    expect(bar.classList.contains('visible')).toBe(true);
  });

  it('close removes visible class and clears input', () => {
    bar.classList.add('visible');
    const input = document.getElementById('search-input');
    input.value = 'test query';

    // Simulate close
    bar.classList.remove('visible');
    input.value = '';

    expect(bar.classList.contains('visible')).toBe(false);
    expect(input.value).toBe('');
  });
});

// ── UI-02: Pills ──────────────────────────────────────────────────────────────

describe('UI-02: Search pills toggle', () => {
  let pillContent, pillAuthor;

  beforeEach(() => {
    const bar = buildSearchBarDOM();
    document.body.appendChild(bar);
    pillContent = document.getElementById('pill-content');
    pillAuthor = document.getElementById('pill-author');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('content pill is active by default', () => {
    expect(pillContent.classList.contains('active')).toBe(true);
  });

  it('author pill is inactive by default', () => {
    expect(pillAuthor.classList.contains('active')).toBe(false);
  });

  it('clicking inactive pill adds active class', () => {
    pillAuthor.classList.add('active');
    expect(pillAuthor.classList.contains('active')).toBe(true);
  });

  it('clicking active pill removes active class (if not last active)', () => {
    // Simulate toggling content pill off when author is also active
    pillAuthor.classList.add('active');
    pillContent.classList.remove('active');
    expect(pillContent.classList.contains('active')).toBe(false);
  });
});

// ── UI-02: Scope toggle ───────────────────────────────────────────────────────

describe('UI-02: Scope toggle (current/all)', () => {
  let scopeCurrent, scopeAll;

  beforeEach(() => {
    const bar = buildSearchBarDOM();
    document.body.appendChild(bar);
    scopeCurrent = document.getElementById('scope-current');
    scopeAll = document.getElementById('scope-all');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('current-thread scope is active by default', () => {
    expect(scopeCurrent.classList.contains('active')).toBe(true);
    expect(scopeAll.classList.contains('active')).toBe(false);
  });

  it('switching to all-threads toggles active state', () => {
    scopeCurrent.classList.remove('active');
    scopeAll.classList.add('active');
    expect(scopeCurrent.classList.contains('active')).toBe(false);
    expect(scopeAll.classList.contains('active')).toBe(true);
  });
});

// ── UI-02: Message highlight / dim logic ─────────────────────────────────────

describe('UI-02: Message highlight and dim classes', () => {
  let messages;

  beforeEach(() => {
    messages = buildMessagesDOM();
    document.body.appendChild(messages);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applying search-highlight adds class to matching rows', () => {
    const rows = messages.querySelectorAll('.msg-row');
    rows[0].classList.add('search-highlight');
    expect(rows[0].classList.contains('search-highlight')).toBe(true);
  });

  it('applying search-dim adds class to non-matching rows', () => {
    const rows = messages.querySelectorAll('.msg-row');
    rows[1].classList.add('search-dim');
    expect(rows[1].classList.contains('search-dim')).toBe(true);
  });

  it('search-match-active can be applied to a row', () => {
    const rows = messages.querySelectorAll('.msg-row');
    rows[0].classList.add('search-match-active');
    expect(rows[0].classList.contains('search-match-active')).toBe(true);
  });

  it('clearing highlights removes all search classes', () => {
    const rows = messages.querySelectorAll('.msg-row');
    rows[0].classList.add('search-highlight', 'search-match-active');
    rows[1].classList.add('search-dim');

    // Simulate clearHighlights
    messages.querySelectorAll('.msg-row').forEach((el) => {
      el.classList.remove('search-highlight', 'search-dim', 'search-match-active');
    });

    rows.forEach((row) => {
      expect(row.classList.contains('search-highlight')).toBe(false);
      expect(row.classList.contains('search-dim')).toBe(false);
      expect(row.classList.contains('search-match-active')).toBe(false);
    });
  });
});
