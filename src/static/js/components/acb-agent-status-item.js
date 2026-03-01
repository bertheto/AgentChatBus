(function () {
  class AcbAgentStatusItem extends HTMLElement {
    constructor() {
      super();
      this._data = null;
    }

    connectedCallback() {
      this.style.display = "block";
      this._render();
    }

    setData(data) {
      this._data = data || null;
      this._render();
    }

    _render() {
      if (!this._data) return;

      const {
        avatarEmoji,
        stateEmoji,
        label,
        state,
        offlineDisplay,
        isLongOffline,
        compressedChar,
        escapeHtml,
        skills,
      } = this._data;

      const esc = typeof escapeHtml === "function" ? escapeHtml : (v) => String(v ?? "");

      const parsedSkills = Array.isArray(skills)
        ? skills
        : (typeof skills === "string" && skills ? (() => { try { return JSON.parse(skills); } catch { return []; } })() : []);
      const skillsBadge = parsedSkills.length > 0
        ? `<span class="skills-badge" title="${parsedSkills.length} skill${parsedSkills.length > 1 ? "s" : ""}: ${esc(parsedSkills.map(s => s.name || s.id).join(", "))}">${parsedSkills.length} skill${parsedSkills.length > 1 ? "s" : ""}</span>`
        : "";

      this.className = "agent-status-item";
      this.dataset.state = String(state ?? "").trim().toLowerCase();

      if (isLongOffline) {
        const compactTitle = compressedChar === "∞" ? "Offline since unknown time" : `Offline ${offlineDisplay || compressedChar}`;
        this.innerHTML = `
          <div class="agent-status-emoji-row">
            <div class="agent-status-emoji">${avatarEmoji}</div>
            <div class="agent-status-text-compact" title="${esc(compactTitle)}">${compressedChar}</div>
            <div class="agent-status-state-emoji" title="${esc(state)}">${stateEmoji}</div>
          </div>
        `;
        return;
      }

      this.innerHTML = `
        <div class="agent-status-emoji-row">
          <div class="agent-status-emoji">${avatarEmoji}</div>
          <span class="agent-status-separator-short">|</span>
          <div class="agent-status-state-emoji" title="${esc(state)}">${stateEmoji}</div>
        </div>
        <div class="agent-state">${esc(state)}${esc(offlineDisplay)}</div>
        ${skillsBadge}
      `;
    }
  }

  if (!customElements.get("acb-agent-status-item")) {
    customElements.define("acb-agent-status-item", AcbAgentStatusItem);
  }
})();
