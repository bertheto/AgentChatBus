(function () {
  const sessionsByThread = new Map();
  const activeSessionIdByThread = new Map();
  const terminalVisibilityByThread = new Map();
  const terminalInstances = new Map();
  const ACTIVE_SESSION_STATES = new Set(["created", "starting", "running"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getActiveThreadId() {
    return window.currentThreadId || null;
  }

  function getPanelEl() {
    return document.getElementById("cli-session-strip");
  }

  function getSessionCountEl() {
    return document.getElementById("cli-session-count");
  }

  function getDetailEl() {
    return document.getElementById("cli-session-detail");
  }

  function getOrCreateSessionMap(threadId) {
    let sessionMap = sessionsByThread.get(threadId);
    if (!sessionMap) {
      sessionMap = new Map();
      sessionsByThread.set(threadId, sessionMap);
    }
    return sessionMap;
  }

  function clearThreadSessions(threadId) {
    sessionsByThread.delete(threadId);
    activeSessionIdByThread.delete(threadId);
    for (const sessionId of Array.from(terminalInstances.keys())) {
      const instance = terminalInstances.get(sessionId);
      if (instance?.threadId === threadId) {
        teardownTerminalInstance(sessionId);
      }
    }
  }

  function sessionDisplayName(session) {
    return String(session?.participant_display_name || "").trim() || sessionLabel(session);
  }

  function sessionLabel(session) {
    const participantLabel = String(session?.participant_display_name || "").trim();
    if (session?.adapter === "codex" && session?.mode === "interactive") {
      return participantLabel ? `${participantLabel} · Codex PTY` : "Codex PTY";
    }
    if (session?.adapter === "cursor" && session?.mode === "headless") {
      return participantLabel ? `${participantLabel} · Cursor headless` : "Cursor headless";
    }
    const base = `${String(session?.adapter || "cli")} ${String(session?.mode || "session")}`;
    return participantLabel ? `${participantLabel} · ${base}` : base;
  }

  function sessionAvatar(session) {
    const resolvedEmoji = String(session?.participant_emoji || "").trim();
    if (resolvedEmoji) {
      return resolvedEmoji;
    }
    const candidate = sessionDisplayName(session).replace(/[^A-Za-z0-9]/g, "");
    return String(candidate.charAt(0) || String(session?.adapter || "A").charAt(0) || "A").toUpperCase();
  }

  function resolvedRole(session) {
    return String(session?.resolved_participant_role || session?.participant_role || "").trim().toLowerCase();
  }

  function stateLabel(state) {
    const raw = String(state || "unknown");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function roleLabel(session) {
    return resolvedRole(session) === "administrator" ? "Administrator" : "Participant";
  }

  function roleTone(session) {
    return resolvedRole(session) === "administrator" ? "admin" : "participant";
  }

  function isInteractiveSession(session) {
    return Boolean(session?.supports_input);
  }

  function isActiveSession(session) {
    return ACTIVE_SESSION_STATES.has(String(session?.state || ""));
  }

  function compareSessionsForDisplay(left, right) {
    const leftAdmin = resolvedRole(left) === "administrator" ? 0 : 1;
    const rightAdmin = resolvedRole(right) === "administrator" ? 0 : 1;
    if (leftAdmin !== rightAdmin) {
      return leftAdmin - rightAdmin;
    }

    const createdCompare = String(left?.created_at || "").localeCompare(String(right?.created_at || ""));
    if (createdCompare !== 0) {
      return createdCompare;
    }

    const nameCompare = sessionDisplayName(left).localeCompare(sessionDisplayName(right));
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  }

  function compareSessionsForPreference(left, right) {
    const leftActive = isActiveSession(left) ? 0 : 1;
    const rightActive = isActiveSession(right) ? 0 : 1;
    if (leftActive !== rightActive) {
      return leftActive - rightActive;
    }

    const leftInteractive = isInteractiveSession(left) ? 0 : 1;
    const rightInteractive = isInteractiveSession(right) ? 0 : 1;
    if (leftInteractive !== rightInteractive) {
      return leftInteractive - rightInteractive;
    }

    const updatedCompare = String(right?.updated_at || "").localeCompare(String(left?.updated_at || ""));
    if (updatedCompare !== 0) {
      return updatedCompare;
    }

    const createdCompare = String(right?.created_at || "").localeCompare(String(left?.created_at || ""));
    if (createdCompare !== 0) {
      return createdCompare;
    }

    return String(right?.id || "").localeCompare(String(left?.id || ""));
  }

  function getSessionsForThread(threadId) {
    return Array.from((sessionsByThread.get(threadId) || new Map()).values()).sort(compareSessionsForDisplay);
  }

  function getParticipantSessionsForThread(threadId) {
    return getSessionsForThread(threadId).filter((session) => Boolean(session?.participant_agent_id));
  }

  function getDeliverySummaryForSeq(seq, threadId = getActiveThreadId()) {
    const normalizedSeq = Number(seq);
    if (!threadId || !Number.isFinite(normalizedSeq) || normalizedSeq <= 0) {
      return null;
    }

    const sessions = getParticipantSessionsForThread(threadId).filter((session) => isActiveSession(session));
    if (!sessions.length) {
      return null;
    }

    const delivered = [];
    const waiting = [];
    for (const session of sessions) {
      const label = sessionDisplayName(session);
      if ((Number(session?.last_delivered_seq) || 0) >= normalizedSeq) {
        delivered.push(label);
      } else {
        waiting.push(label);
      }
    }

    return {
      participantCount: sessions.length,
      delivered,
      waiting,
    };
  }

  function choosePreferredSession(sessions) {
    return [...sessions].sort(compareSessionsForPreference)[0] || null;
  }

  function ensureSelectedSession(threadId) {
    const sessions = getSessionsForThread(threadId);
    if (!sessions.length) {
      activeSessionIdByThread.delete(threadId);
      return null;
    }

    const activeSessionId = activeSessionIdByThread.get(threadId);
    if (activeSessionId) {
      const existing = sessions.find((session) => session.id === activeSessionId);
      if (existing) {
        return existing;
      }
    }

    const preferred = choosePreferredSession(sessions);
    if (preferred?.id) {
      activeSessionIdByThread.set(threadId, preferred.id);
    }
    return preferred;
  }

  function getSelectedSession(threadId = getActiveThreadId()) {
    if (!threadId) {
      return null;
    }
    return ensureSelectedSession(threadId);
  }

  function isTerminalVisible(threadId = getActiveThreadId()) {
    if (!threadId) {
      return true;
    }
    return terminalVisibilityByThread.get(threadId) !== false;
  }

  function setTerminalVisibility(threadId, visible) {
    if (!threadId) {
      return;
    }
    terminalVisibilityByThread.set(threadId, visible !== false);
  }

  function toggleTerminalVisibility(threadId = getActiveThreadId()) {
    if (!threadId) {
      return;
    }
    setTerminalVisibility(threadId, !isTerminalVisible(threadId));
    renderThread(threadId);
  }

  function replaceSessionsForThread(threadId, sessions) {
    if (!threadId) {
      return;
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
      clearThreadSessions(threadId);
      return;
    }

    const nextMap = new Map();
    sessions.forEach((session) => {
      if (session?.id) {
        nextMap.set(session.id, session);
      }
    });

    sessionsByThread.set(threadId, nextMap);
    ensureSelectedSession(threadId);
  }

  function upsertSession(session) {
    if (!session?.thread_id || !session?.id) {
      return;
    }
    const sessionMap = getOrCreateSessionMap(session.thread_id);
    sessionMap.set(session.id, session);
    ensureSelectedSession(session.thread_id);
    if (session.thread_id === getActiveThreadId()) {
      renderThread(session.thread_id);
    }
  }

  function selectSession(sessionId, threadId = getActiveThreadId()) {
    if (!threadId || !sessionId) {
      return null;
    }
    const sessionMap = sessionsByThread.get(threadId);
    if (!sessionMap || !sessionMap.has(sessionId)) {
      return null;
    }
    activeSessionIdByThread.set(threadId, sessionId);
    return sessionMap.get(sessionId) || null;
  }

  function selectSessionFromElement(element) {
    const sessionId = element?.getAttribute("data-session-id");
    return selectSession(sessionId);
  }

  function getTerminalInstance(sessionId) {
    return terminalInstances.get(sessionId) || null;
  }

  function teardownTerminalInstance(sessionId) {
    const runtime = terminalInstances.get(sessionId);
    if (!runtime) {
      return;
    }
    if (runtime.resizeObserver) {
      runtime.resizeObserver.disconnect();
    }
    if (runtime.resizeTimer) {
      window.clearTimeout(runtime.resizeTimer);
    }
    if (runtime.terminal) {
      runtime.terminal.dispose();
    }
    terminalInstances.delete(sessionId);
  }

  function teardownAllTerminals() {
    for (const sessionId of Array.from(terminalInstances.keys())) {
      teardownTerminalInstance(sessionId);
    }
  }

  function writeTerminalNotice(sessionId, message) {
    const runtime = getTerminalInstance(sessionId);
    if (!runtime?.terminal) {
      return;
    }
    runtime.terminal.write(`\r\n[agentchatbus] ${message}\r\n`);
  }

  async function getUiAgent() {
    return window.AcbUiAgent ? await window.AcbUiAgent.ensureUiAgent() : null;
  }

  async function syncTerminalSize(sessionId) {
    const runtime = getTerminalInstance(sessionId);
    if (!runtime?.fitAddon || !runtime.hostEl?.isConnected) {
      return;
    }

    const dims = runtime.fitAddon.proposeDimensions();
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) {
      return;
    }

    const nextCols = Math.max(1, Math.floor(dims.cols));
    const nextRows = Math.max(1, Math.floor(dims.rows));
    if (runtime.lastResizeCols === nextCols && runtime.lastResizeRows === nextRows) {
      return;
    }

    runtime.fitAddon.fit();
    runtime.lastResizeCols = nextCols;
    runtime.lastResizeRows = nextRows;

    const uiAgent = await getUiAgent();
    if (!uiAgent) {
      return;
    }

    const result = await window.AcbApi.api(`/api/cli-sessions/${sessionId}/resize`, {
      method: "POST",
      headers: {
        "X-Agent-Token": uiAgent.token,
      },
      body: JSON.stringify({
        requested_by_agent_id: uiAgent.agent_id,
        cols: nextCols,
        rows: nextRows,
      }),
    });

    if (result?.ok === false) {
      throw new Error(result.error || "Resize was rejected.");
    }
  }

  function scheduleTerminalResize(sessionId) {
    const runtime = getTerminalInstance(sessionId);
    if (!runtime) {
      return;
    }
    if (runtime.resizeTimer) {
      window.clearTimeout(runtime.resizeTimer);
    }
    runtime.resizeTimer = window.setTimeout(() => {
      syncTerminalSize(sessionId).catch((error) => {
        writeTerminalNotice(sessionId, error instanceof Error ? error.message : String(error));
      });
    }, 80);
  }

  function appendTerminalOutput(sessionId, entry) {
    const runtime = getTerminalInstance(sessionId);
    if (!runtime?.terminal || !entry || typeof entry.seq !== "number") {
      return;
    }
    if (entry.seq <= runtime.outputCursor) {
      return;
    }
    runtime.terminal.write(String(entry.text || ""));
    runtime.outputCursor = entry.seq;
  }

  async function mountTerminalForSessionCard(session, hostEl) {
    if (!isInteractiveSession(session) || !hostEl) {
      return;
    }

    const existing = getTerminalInstance(session.id);
    if (existing?.hostEl === hostEl && existing.terminal) {
      scheduleTerminalResize(session.id);
      return;
    }

    if (existing) {
      teardownTerminalInstance(session.id);
    }

    hostEl.innerHTML = "";

    if (!window.Terminal || !window.FitAddon || !window.FitAddon.FitAddon) {
      hostEl.innerHTML = '<div class="cli-session-terminal__fallback">xterm.js did not load.</div>';
      return;
    }

    const terminal = new window.Terminal({
      allowTransparency: true,
      cursorBlink: true,
      convertEol: false,
      disableStdin: true,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: {
        background: "#08111f",
        foreground: "#dbeafe",
        cursor: "#7dd3fc",
        selectionBackground: "rgba(59, 130, 246, 0.28)",
      },
    });
    const fitAddon = new window.FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostEl);
    if (typeof terminal.attachCustomKeyEventHandler === "function") {
      terminal.attachCustomKeyEventHandler(() => false);
    }

    const runtime = {
      sessionId: session.id,
      threadId: session.thread_id,
      terminal,
      fitAddon,
      hostEl,
      outputCursor: 0,
      resizeObserver: null,
      resizeTimer: null,
      lastResizeCols: null,
      lastResizeRows: null,
    };
    terminalInstances.set(session.id, runtime);

    if (typeof ResizeObserver === "function") {
      runtime.resizeObserver = new ResizeObserver(() => {
        scheduleTerminalResize(session.id);
      });
      runtime.resizeObserver.observe(hostEl);
    }

    scheduleTerminalResize(session.id);

    try {
      const result = await window.AcbApi.api(`/api/cli-sessions/${session.id}/output?after=0&limit=1000`);
      const latest = getTerminalInstance(session.id);
      if (!latest || latest.hostEl !== hostEl) {
        return;
      }
      const entries = Array.isArray(result?.entries) ? result.entries : [];
      entries.forEach((entry) => appendTerminalOutput(session.id, entry));
    } catch (error) {
      writeTerminalNotice(session.id, error instanceof Error ? error.message : String(error));
    }
  }

  function ensurePanelShell(panelEl) {
    if (!panelEl || panelEl.dataset.cliSessionShell === "1") {
      return;
    }

    panelEl.innerHTML = `
      <div class="cli-session-strip__header">
        <div class="cli-session-strip__title">
          <span>Agent Sessions</span>
          <span id="cli-session-count" class="cli-session-strip__count">0 sessions</span>
        </div>
      </div>
      <div id="cli-session-detail" class="cli-session-detail cli-session-detail--grid"></div>
    `;
    panelEl.dataset.cliSessionShell = "1";
  }

  function renderHeaderSummary(sessions) {
    const countEl = getSessionCountEl();
    if (!countEl) {
      return;
    }
    const count = Array.isArray(sessions) ? sessions.length : 0;
    countEl.textContent = `${count} session${count === 1 ? "" : "s"}`;
  }

  function renderTerminalToggle(threadId = getActiveThreadId()) {
    const toggleEl = document.getElementById("thread-agent-panel-toggle");
    if (!toggleEl) {
      return;
    }
    const visible = isTerminalVisible(threadId);
    const labelEl = toggleEl.querySelector(".thread-agent-panel-toggle__label");
    if (labelEl) {
      labelEl.textContent = visible ? "Hide Agent Panel" : "Show Agent Panel";
    }
    toggleEl.setAttribute("aria-label", visible ? "Hide agent panel" : "Show agent panel");
    toggleEl.setAttribute("title", visible ? "Hide the agent session panel" : "Show the agent session panel");
  }

  function getSessionStatusText(session) {
    const state = stateLabel(session.state);
    const replyCapture = String(session?.reply_capture_state || "").trim();
    if (replyCapture === "working" || replyCapture === "streaming" || replyCapture === "waiting_for_reply") {
      return "Working";
    }
    if (String(session?.meeting_post_state || "").trim() === "posting") {
      return "Posting";
    }
    return state;
  }

  function canSendManualControl(session) {
    return Boolean(isInteractiveSession(session) && session?.supports_input && session?.state === "running");
  }

  function buildSessionMeta(session) {
    return [
      String(session.adapter || "CLI"),
      String(session.mode || "session"),
      getSessionStatusText(session),
    ].join(" · ");
  }

  function createSessionCardElement(session) {
    const card = document.createElement("section");
    card.className = "cli-session-card";
    card.dataset.sessionId = String(session.id || "");
    card.innerHTML = `
      <div class="cli-session-card__header">
        <div class="cli-session-card__identity">
          <span class="cli-session-card__avatar" data-role="avatar"></span>
          <div class="cli-session-card__identity-body">
            <div class="cli-session-card__identity-row">
              <span class="cli-session-card__name" data-role="name"></span>
              <span class="cli-session-role-badge" data-role="role"></span>
            </div>
            <div class="cli-session-card__meta" data-role="meta"></div>
          </div>
        </div>
        <div class="cli-session-card__actions">
          <button type="button" class="btn-secondary btn-compact" data-role="enter">Enter</button>
          <button type="button" class="btn-secondary btn-compact cli-session-card__danger" data-role="escape">ESC</button>
        </div>
      </div>
      <div class="cli-session-card__body">
        <div class="cli-session-terminal__shell cli-session-terminal__shell--card" data-role="terminal-shell">
          <div class="cli-session-terminal cli-session-terminal--card" data-role="terminal"></div>
        </div>
      </div>
    `;

    const enterBtn = card.querySelector('[data-role="enter"]');
    const escapeBtn = card.querySelector('[data-role="escape"]');
    if (enterBtn) {
      enterBtn.addEventListener("click", () => {
        void confirmAndSendControl(session.id, "enter");
      });
    }
    if (escapeBtn) {
      escapeBtn.addEventListener("click", () => {
        void confirmAndSendControl(session.id, "escape");
      });
    }
    return card;
  }

  function updateSessionCardElement(card, session) {
    card.dataset.sessionId = String(session.id || "");
    card.dataset.sessionState = String(session.state || "");

    const avatarEl = card.querySelector('[data-role="avatar"]');
    const nameEl = card.querySelector('[data-role="name"]');
    const roleEl = card.querySelector('[data-role="role"]');
    const metaEl = card.querySelector('[data-role="meta"]');
    const terminalEl = card.querySelector('[data-role="terminal"]');
    const terminalShellEl = card.querySelector('[data-role="terminal-shell"]');
    const enterBtn = card.querySelector('[data-role="enter"]');
    const escapeBtn = card.querySelector('[data-role="escape"]');

    if (avatarEl) {
      avatarEl.textContent = sessionAvatar(session);
    }
    if (nameEl) {
      nameEl.textContent = sessionDisplayName(session);
    }
    if (roleEl) {
      roleEl.textContent = roleLabel(session);
      roleEl.className = `cli-session-role-badge cli-session-role-badge--${roleTone(session)}`;
    }
    if (metaEl) {
      metaEl.textContent = buildSessionMeta(session);
    }

    const manualEnabled = canSendManualControl(session);
    if (enterBtn) {
      enterBtn.disabled = !manualEnabled;
      enterBtn.title = manualEnabled ? "Send Enter to the CLI after confirmation" : "This session cannot receive manual input right now";
    }
    if (escapeBtn) {
      escapeBtn.disabled = !manualEnabled;
      escapeBtn.title = manualEnabled ? "Send ESC to the CLI after confirmation" : "This session cannot receive manual input right now";
    }

    if (isInteractiveSession(session)) {
      if (terminalShellEl) {
        terminalShellEl.hidden = false;
      }
      if (terminalEl) {
        void mountTerminalForSessionCard(session, terminalEl);
      }
    } else {
      teardownTerminalInstance(session.id);
      if (terminalShellEl) {
        terminalShellEl.hidden = false;
      }
      if (terminalEl) {
        terminalEl.innerHTML = "";
      }
    }
  }

  function renderSessionCards(detailEl, sessions) {
    if (!detailEl) {
      return;
    }

    const existingCards = new Map(
      Array.from(detailEl.querySelectorAll(".cli-session-card")).map((card) => [card.dataset.sessionId, card]),
    );
    const nextIds = new Set(sessions.map((session) => String(session.id || "")));

    for (const [sessionId, card] of existingCards.entries()) {
      if (!nextIds.has(sessionId)) {
        teardownTerminalInstance(sessionId);
        card.remove();
      }
    }

    sessions.forEach((session) => {
      const sessionId = String(session.id || "");
      let card = existingCards.get(sessionId);
      if (!card) {
        card = createSessionCardElement(session);
      }
      updateSessionCardElement(card, session);
      detailEl.appendChild(card);
    });
  }

  function renderEmptyState(panelEl) {
    ensurePanelShell(panelEl);
    panelEl.hidden = false;
    panelEl.dataset.selectedSessionId = "";
    renderHeaderSummary([]);

    const detailEl = getDetailEl();
    if (detailEl) {
      detailEl.innerHTML = `
        <div class="cli-session-detail__empty">
          <strong>No agent sessions are active for this thread yet.</strong><br>
          Interactive agent terminals will appear here as fixed-size cards when sessions start.
        </div>
      `;
    }

    teardownAllTerminals();
    if (window.AcbChat?.refreshHumanDeliveryIndicators) {
      window.AcbChat.refreshHumanDeliveryIndicators(getActiveThreadId());
    }
  }

  function renderThread(threadId = getActiveThreadId()) {
    const panelEl = getPanelEl();
    if (!panelEl) {
      return;
    }

    if (!threadId) {
      teardownAllTerminals();
      panelEl.hidden = true;
      panelEl.innerHTML = "";
      panelEl.dataset.cliSessionShell = "";
      panelEl.dataset.selectedSessionId = "";
      return;
    }

    ensurePanelShell(panelEl);
    renderTerminalToggle(threadId);
    const terminalVisible = isTerminalVisible(threadId);
    panelEl.hidden = !terminalVisible;
    if (!terminalVisible) {
      teardownAllTerminals();
      if (window.AcbChat?.refreshHumanDeliveryIndicators) {
        window.AcbChat.refreshHumanDeliveryIndicators(threadId);
      }
      return;
    }

    const sessions = getSessionsForThread(threadId);
    if (!sessions.length) {
      renderEmptyState(panelEl);
      return;
    }

    ensureSelectedSession(threadId);
    renderHeaderSummary(sessions);
    renderSessionCards(getDetailEl(), sessions);
    if (window.AcbChat?.refreshHumanDeliveryIndicators) {
      window.AcbChat.refreshHumanDeliveryIndicators(threadId);
    }
  }

  async function refreshThread(threadId, api) {
    if (!threadId) {
      renderThread(null);
      return null;
    }

    const result = await api(`/api/threads/${threadId}/cli-sessions`);
    const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
    replaceSessionsForThread(threadId, sessions);
    renderThread(threadId);

    if (window.AcbChat && typeof window.AcbChat.refreshThreadAdmin === "function") {
      await window.AcbChat.refreshThreadAdmin(threadId, api);
    }

    return getSelectedSession(threadId);
  }

  async function startCodexInteractive(api) {
    const threadId = getActiveThreadId();
    if (!threadId) {
      return null;
    }

    const uiAgent = await getUiAgent();
    if (!uiAgent) {
      return null;
    }

    const result = await api(`/api/threads/${threadId}/cli-sessions`, {
      method: "POST",
      headers: {
        "X-Agent-Token": uiAgent.token,
      },
      body: JSON.stringify({
        adapter: "codex",
        mode: "interactive",
        prompt: "who are you",
        requested_by_agent_id: uiAgent.agent_id,
        cols: 120,
        rows: 32,
      }),
    });

    if (result?.session) {
      upsertSession(result.session);
      selectSession(result.session.id, threadId);
      return result.session;
    }

    return null;
  }

  async function restartSelected(api) {
    const threadId = getActiveThreadId();
    const session = getSelectedSession(threadId);
    if (!threadId || !session) {
      return null;
    }

    const uiAgent = await getUiAgent();
    if (!uiAgent) {
      return null;
    }

    const result = await api(`/api/cli-sessions/${session.id}/restart`, {
      method: "POST",
      headers: {
        "X-Agent-Token": uiAgent.token,
      },
      body: JSON.stringify({
        requested_by_agent_id: uiAgent.agent_id,
      }),
    });

    if (result?.session) {
      upsertSession(result.session);
      selectSession(result.session.id, threadId);
      return result.session;
    }

    return null;
  }

  async function stopSelected(api) {
    const threadId = getActiveThreadId();
    const session = getSelectedSession(threadId);
    if (!threadId || !session) {
      return null;
    }

    const uiAgent = await getUiAgent();
    if (!uiAgent) {
      return null;
    }

    const result = await api(`/api/cli-sessions/${session.id}/stop`, {
      method: "POST",
      headers: {
        "X-Agent-Token": uiAgent.token,
      },
      body: JSON.stringify({
        requested_by_agent_id: uiAgent.agent_id,
      }),
    });

    if (result?.session) {
      upsertSession(result.session);
      selectSession(result.session.id, threadId);
      return result.session;
    }

    return null;
  }

  async function sendManualInput(sessionId, text, notice) {
    const uiAgent = await getUiAgent();
    if (!uiAgent) {
      return null;
    }

    const result = await window.AcbApi.api(`/api/cli-sessions/${sessionId}/input`, {
      method: "POST",
      headers: {
        "X-Agent-Token": uiAgent.token,
      },
      body: JSON.stringify({
        requested_by_agent_id: uiAgent.agent_id,
        text,
      }),
    });

    if (result?.ok) {
      writeTerminalNotice(sessionId, notice);
    }
    return result;
  }

  async function confirmAndSendControl(sessionId, controlType) {
    const session = getSessionsForThread(getActiveThreadId()).find((item) => item.id === sessionId);
    if (!session || !canSendManualControl(session)) {
      return null;
    }

    const confirmDialog = document.getElementById("confirm-dialog");
    if (!confirmDialog || typeof confirmDialog.show !== "function") {
      return null;
    }

    const isEscape = controlType === "escape";
    const keyLabel = isEscape ? "ESC" : "Enter";
    const confirmed = await confirmDialog.show({
      title: `Send ${keyLabel}`,
      message: `
        <strong>This sends a real ${keyLabel} keypress to the CLI terminal.</strong><br><br>
        This is meant as a manual recovery tool when an agent appears stuck or is waiting at a prompt.<br><br>
        It can interrupt or alter the current automatic flow, so only continue if you really want to send ${keyLabel} to <code>${escapeHtml(sessionDisplayName(session))}</code>.
      `,
      confirmText: `Send ${keyLabel}`,
      confirmClass: isEscape ? "btn-destructive" : "btn-primary",
    });

    if (!confirmed) {
      return null;
    }

    const text = isEscape ? "\u001b" : "\r";
    const notice = isEscape ? "Manual ESC sent." : "Manual Enter sent.";
    return await sendManualInput(sessionId, text, notice);
  }

  function handleSseEvent(event) {
    const type = String(event?.type || "");
    if (!type.startsWith("cli.session.")) {
      return;
    }

    if (type === "cli.session.output") {
      const sessionId = event?.payload?.session_id;
      const entry = event?.payload?.entry;
      if (sessionId) {
        appendTerminalOutput(sessionId, entry);
      }
      return;
    }

    const session = event?.payload?.session;
    if (session?.thread_id) {
      upsertSession(session);
    }
  }

  window.AcbCliSessions = {
    refreshThread,
    renderThread,
    handleSseEvent,
    getDeliverySummaryForSeq,
    selectSession,
    selectSessionFromElement,
    toggleTerminalVisibility,
    confirmAndSendControl,
    startCodexInteractive: () => startCodexInteractive(window.AcbApi.api),
    restartSelected: () => restartSelected(window.AcbApi.api),
    stopSelected: () => stopSelected(window.AcbApi.api),
    restartLatest: () => restartSelected(window.AcbApi.api),
    stopLatest: () => stopSelected(window.AcbApi.api),
  };

  window.launchCodexPtySession = () => startCodexInteractive(window.AcbApi.api);
})();
