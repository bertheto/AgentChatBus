/**
 * UI-07: Message Navigation Rail (Emoji Minimap)
 * Absolute-positioned emoji markers on the right edge of #messages-wrap,
 * one per message, aligned to its msg-row. Click to scroll to the message.
 * Activatable/deactivatable via Settings > UI Preferences.
 */
(function () {
  const STORAGE_KEY = "acb-minimap-enabled";

  let _scrollListener = null;
  let _resizeObserver = null;

  // ─── Enabled state ────────────────────────────────────────────────────────

  function isEnabled() {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === "true";
  }

  function applyEnabledState() {
    document.body.classList.toggle("minimap-hidden", !isEnabled());
  }

  function setEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    document.body.classList.toggle("minimap-hidden", !enabled);
  }

  // ─── Position dots ────────────────────────────────────────────────────────

  function positionDots() {
    const rail = document.getElementById("nav-rail");
    const messagesEl = document.getElementById("messages");
    if (!rail || !messagesEl) return;

    const dots = rail.querySelectorAll(".nav-dot");
    const rows = messagesEl.querySelectorAll(".msg-row[data-seq]");

    if (dots.length !== rows.length) {
      // Mismatch — full rebuild needed
      buildRail();
      return;
    }

    // Reposition each dot based on current scroll
    const scrollTop = messagesEl.scrollTop;
    rows.forEach((row, i) => {
      const dot = dots[i];
      if (!dot) return;
      const top = row.offsetTop - scrollTop;
      dot.style.top = top + "px";
      // Show/hide if out of visible area
      const messagesHeight = messagesEl.clientHeight;
      dot.style.opacity = (top >= 0 && top <= messagesHeight) ? "1" : "0";
      dot.style.pointerEvents = (top >= 0 && top <= messagesHeight) ? "auto" : "none";
    });
  }

  // ─── Build rail ───────────────────────────────────────────────────────────

  function buildRail() {
    const rail = document.getElementById("nav-rail");
    const messagesEl = document.getElementById("messages");
    if (!rail || !messagesEl) return;

    // Detach old scroll listener
    if (_scrollListener) {
      messagesEl.removeEventListener("scroll", _scrollListener);
      _scrollListener = null;
    }
    if (_resizeObserver) {
      _resizeObserver.disconnect();
      _resizeObserver = null;
    }

    rail.innerHTML = "";

    const rows = messagesEl.querySelectorAll(".msg-row[data-seq]");
    if (rows.length === 0) return;

    const scrollTop = messagesEl.scrollTop;
    const messagesHeight = messagesEl.clientHeight;

    rows.forEach((row) => {
      const seq = row.getAttribute("data-seq");
      const authorId = row.getAttribute("data-author-id") || "unknown";

      // Get emoji from avatar element
      const avatarEl = row.querySelector(".msg-avatar");
      const emoji = avatarEl ? avatarEl.textContent.trim() : "💬";

      // Get author name for tooltip
      const authorNameEl = row.querySelector(".msg-author-label");
      const authorName = authorNameEl ? authorNameEl.textContent.trim() : authorId;

      // Get timestamp for tooltip
      const timeEl = row.querySelector(".msg-time-label");
      const timeText = timeEl ? timeEl.textContent.trim() : "";

      const top = row.offsetTop - scrollTop;
      const visible = top >= 0 && top <= messagesHeight;

      const dot = document.createElement("button");
      dot.className = "nav-dot";
      dot.setAttribute("data-seq", seq);
      dot.setAttribute("data-author-id", authorId);
      dot.setAttribute("title", `${authorName}${timeText ? " · " + timeText : ""}`);
      dot.setAttribute("aria-label", `Jump to message ${seq} from ${authorName}`);
      dot.textContent = emoji;
      dot.style.top = top + "px";
      dot.style.opacity = visible ? "1" : "0";
      dot.style.pointerEvents = visible ? "auto" : "none";

      dot.addEventListener("click", () => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("nav-highlight");
        setTimeout(() => row.classList.remove("nav-highlight"), 1200);
      });

      rail.appendChild(dot);
    });

    // Reposition on scroll
    _scrollListener = positionDots;
    messagesEl.addEventListener("scroll", _scrollListener, { passive: true });

    // Reposition on resize (messages area resized)
    _resizeObserver = new ResizeObserver(() => positionDots());
    _resizeObserver.observe(messagesEl);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  window.AcbNavSidebar = {
    rebuild() {
      buildRail();
    },
    onNewMessage() {
      buildRail();
    },
    setEnabled,
    isEnabled,
    applyEnabledState,
  };

  applyEnabledState();
})();
