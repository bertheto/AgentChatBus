/**
 * UI-07: Message Navigation Sidebar (Minimap)
 * Scrollable sidebar on the right of the chat area with clickable anchors
 * per agent + timestamp. Activatable/deactivatable via Settings > UI Preferences.
 */
(function () {
  const STORAGE_KEY = "acb-minimap-enabled";
  const AUTHOR_COLORS = [
    "var(--accent-a)",
    "var(--accent-b)",
    "var(--accent-c)",
    "var(--accent-d)",
    "var(--accent-e)",
  ];

  let _observer = null;
  let _authorColorMap = {};
  let _colorIndex = 0;

  // ─── Colour assignment ────────────────────────────────────────────────────

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

  // ─── Enabled state ────────────────────────────────────────────────────────

  function isEnabled() {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === "true";
  }

  function applyEnabledState() {
    document.body.classList.toggle("minimap-hidden", !isEnabled());
  }

  // ─── Build anchors ────────────────────────────────────────────────────────

  function buildAnchors() {
    const sidebar = document.getElementById("nav-sidebar");
    if (!sidebar) return;

    const list = sidebar.querySelector(".nav-sidebar-list");
    if (!list) return;

    list.innerHTML = "";
    resetColors();

    const rows = document.querySelectorAll(".msg-row[data-seq]");

    if (rows.length === 0) {
      sidebar.classList.add("nav-sidebar-empty");
      return;
    }
    sidebar.classList.remove("nav-sidebar-empty");

    rows.forEach((row) => {
      const seq = row.getAttribute("data-seq");
      const authorId = row.getAttribute("data-author-id") || "unknown";

      // Derive label: try the author name label inside the row
      const authorNameEl = row.querySelector(".msg-author-name, .msg-author, .author-label");
      const authorName = authorNameEl
        ? authorNameEl.textContent.trim()
        : authorId;

      // Derive timestamp from the row's tail-meta component or time element
      const timeEl = row.querySelector("time, .msg-time, .msg-ts, acb-message-tail-meta");
      const timestamp = timeEl ? timeEl.getAttribute("datetime") || timeEl.textContent.trim() : "";

      const color = getAuthorColor(authorId);

      const anchor = document.createElement("button");
      anchor.className = "nav-anchor";
      anchor.setAttribute("data-seq", seq);
      anchor.setAttribute("data-author-id", authorId);
      anchor.setAttribute("title", `${authorName}${timestamp ? " · " + timestamp : ""} (seq ${seq})`);
      anchor.setAttribute("aria-label", `Jump to message ${seq} from ${authorName}`);
      anchor.innerHTML = `
        <span class="nav-anchor-dot" style="background:${color};"></span>
        <span class="nav-anchor-label">
          <span class="nav-anchor-name">${_escHtml(authorName)}</span>
          ${timestamp ? `<span class="nav-anchor-ts">${_escHtml(timestamp)}</span>` : ""}
        </span>`;

      anchor.addEventListener("click", () => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        // Briefly highlight
        row.classList.add("nav-highlight");
        setTimeout(() => row.classList.remove("nav-highlight"), 1200);
      });

      list.appendChild(anchor);
    });

    // Re-init intersection observer
    _initObserver(list);
  }

  function _escHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── Active anchor tracking via IntersectionObserver ─────────────────────

  function _initObserver(list) {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }

    const messagesEl = document.getElementById("messages");
    if (!messagesEl) return;

    _observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const seq = entry.target.getAttribute("data-seq");
          const anchor = list.querySelector(`.nav-anchor[data-seq="${seq}"]`);
          if (anchor) {
            anchor.classList.toggle("nav-anchor-active", entry.isIntersecting);
          }
        });
      },
      {
        root: messagesEl,
        threshold: 0.2,
      }
    );

    document.querySelectorAll(".msg-row[data-seq]").forEach((row) => {
      _observer.observe(row);
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  window.AcbNavSidebar = {
    /**
     * Call once at init and after loading a thread.
     */
    rebuild() {
      buildAnchors();
    },

    /**
     * Call after each appendBubble to add the new anchor without full rebuild.
     * Falls back to full rebuild for simplicity.
     */
    onNewMessage() {
      buildAnchors();
    },

    /**
     * Called from Settings modal to toggle minimap visibility.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
      localStorage.setItem(STORAGE_KEY, String(enabled));
      document.body.classList.toggle("minimap-hidden", !enabled);
    },

    /**
     * Returns current enabled state (reads localStorage).
     */
    isEnabled,

    /**
     * Apply saved state on page load.
     */
    applyEnabledState,
  };

  // Apply state immediately on script load
  applyEnabledState();
})();
