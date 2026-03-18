import * as vscode from 'vscode';

export class StatusPanel {
    public static currentPanel: StatusPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private metadata: any) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview();
    }

    public static createOrShow(metadata: any) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (StatusPanel.currentPanel) {
            StatusPanel.currentPanel.metadata = metadata;
            StatusPanel.currentPanel._panel.webview.html = StatusPanel.currentPanel._getHtmlForWebview();
            StatusPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'acbStatus',
            'AgentChatBus: Server Status',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        StatusPanel.currentPanel = new StatusPanel(panel, metadata);
    }

    public dispose() {
        StatusPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview() {
        const m = this.metadata;
        const ide = m.ide || {};
        const mcp = m.mcp || {};
        const attempts = Array.isArray(m.resolutionAttempts) ? m.resolutionAttempts : [];
        const uptime = m.startTime ? this._getUptime(new Date(m.startTime)) : 'N/A';
        const serverStatus = m.pid ? 'RUNNING' : 'STOPPED';
        const mcpApiStatus = mcp.apiAvailable ? 'AVAILABLE' : 'UNAVAILABLE';
        const mcpProviderStatus = mcp.providerRegistered ? 'REGISTERED' : 'PENDING';
        const startupMode = this._getStartupModeSummary(m.startupMode);
        const backend = this._getBackendSummary(m.backendEngine, m.startupMode);
        const backendSource = m.backendEngineSource || 'unknown';
        const appDir = m.env?.AGENTCHATBUS_APP_DIR || 'N/A';
        const dbPath = m.env?.AGENTCHATBUS_DB || 'N/A';
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Server Status</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            line-height: 1.6;
        }
        h1 { color: var(--vscode-button-background); border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 10px; font-weight: 300; }
        h2 { font-size: 1.1em; margin-top: 30px; color: var(--vscode-symbolIcon-propertyForeground); text-transform: uppercase; letter-spacing: 1px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border); padding: 15px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .label { font-weight: bold; color: var(--vscode-descriptionForeground); font-size: 0.9em; min-width: 120px; display: inline-block; }
        .value { font-family: 'Courier New', Courier, monospace; color: var(--vscode-textPreformat-foreground); word-break: break-all; }
        .status-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: bold; background: #28a745; color: white; }
        .hint { margin-top: 10px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
        .mode-help { margin-top: 10px; border-top: 1px solid var(--vscode-widget-border); padding-top: 8px; }
        .mode-help-item { margin-top: 4px; }
        .mode-help code { font-size: 0.95em; }
        .env-list { margin: 0; padding: 0; list-style: none; font-size: 0.9em; }
        .env-item { border-bottom: 1px solid var(--vscode-widget-border); padding: 4px 0; display: flex; justify-content: space-between; }
        .env-key { color: var(--vscode-symbolIcon-variableForeground); }
        .env-val { color: var(--vscode-textLink-foreground); text-align: right; overflow: hidden; text-overflow: ellipsis; }
    </style>
</head>
<body>
    <h1>📟 AgentChatBus System Diagnostics</h1>
    
    <div class="grid">
        <div class="card">
            <h2>🌍 Server Instance</h2>
            <div><span class="label">Status:</span> <span class="status-badge">${serverStatus}</span></div>
            <div><span class="label">PID:</span> <span class="value">${m.pid || 'N/A'}</span></div>
            <div><span class="label">Uptime:</span> <span class="value">${uptime}</span></div>
            <div><span class="label">Started At:</span> <span class="value">${m.startTime || 'N/A'}</span></div>
            <div><span class="label">Backend:</span> <span class="value">${backend}</span></div>
            <div><span class="label">Backend Source:</span> <span class="value">${backendSource}</span></div>
        </div>

        <div class="card">
            <h2>⚙️ Startup Configuration</h2>
            <div><span class="label">Mode:</span> <span class="value">${startupMode.label}</span></div>
            <div class="hint">${startupMode.description}</div>
            <div><span class="label">Resolved By:</span> <span class="value">${m.resolvedBy || 'N/A'}</span></div>
            <div><span class="label">Executable:</span> <span class="value">${m.command || 'N/A'}</span></div>
            <div><span class="label">Arguments:</span> <span class="value">${m.args ? m.args.join(' ') : 'N/A'}</span></div>
            <div><span class="label">WorkDir:</span> <span class="value">${m.cwd || 'N/A'}</span></div>
            <div><span class="label">App Dir:</span> <span class="value">${appDir}</span></div>
            <div><span class="label">DB Path:</span> <span class="value">${dbPath}</span></div>
            <div class="mode-help">
                <div><span class="label">Supported Modes:</span> <span class="value">2</span></div>
                <div class="mode-help-item"><code>bundled-ts-service</code>: Extension launches bundled agentchatbus-ts (managed by VS Code extension).</div>
                <div class="mode-help-item"><code>external-service</code>: Reuses an already-running backend discovered via /health (managed outside extension).</div>
            </div>
        </div>

        <div class="card">
            <h2>💻 Runtime Environment</h2>
            <div><span class="label">Platform:</span> <span class="value">${m.platform} (${m.arch})</span></div>
            <div><span class="label">Node.js:</span> <span class="value">${m.nodeVersion}</span></div>
            <div><span class="label">Host Node:</span> <span class="value">${m.hostNodeExecutable || 'N/A'}</span></div>
            <div><span class="label">VS Code:</span> <span class="value">${m.vscodeVersion}</span></div>
        </div>

        <div class="card">
            <h2>🪪 IDE Ownership</h2>
            <div><span class="label">Instance ID:</span> <span class="value">${ide.instanceId || 'N/A'}</span></div>
            <div><span class="label">Label:</span> <span class="value">${ide.label || 'N/A'}</span></div>
            <div><span class="label">Registered:</span> <span class="value">${ide.registered ? 'yes' : 'no'}</span></div>
            <div><span class="label">Is Owner:</span> <span class="value">${ide.isOwner ? 'yes' : 'no'}</span></div>
            <div><span class="label">Can Shutdown:</span> <span class="value">${ide.canShutdown ? 'yes' : 'no'}</span></div>
            <div><span class="label">Owner Assignable:</span> <span class="value">${ide.ownershipAssignable ? 'yes' : 'no'}</span></div>
            <div><span class="label">Current Owner:</span> <span class="value">${ide.ownerInstanceId || 'none'}</span></div>
            <div><span class="label">Owner Label:</span> <span class="value">${ide.ownerLabel || 'none'}</span></div>
            <div><span class="label">Registered IDEs:</span> <span class="value">${ide.registeredSessionsCount ?? 0}</span></div>
        </div>

        <div class="card">
            <h2>🔌 MCP Integration</h2>
            <div><span class="label">API:</span> <span class="status-badge">${mcpApiStatus}</span></div>
            <div><span class="label">Provider:</span> <span class="status-badge">${mcpProviderStatus}</span></div>
            <div><span class="label">Provider ID:</span> <span class="value">${mcp.providerId || 'N/A'}</span></div>
            <div><span class="label">Label:</span> <span class="value">${mcp.providerLabel || 'N/A'}</span></div>
            <div><span class="label">Transport:</span> <span class="value">${mcp.transport || 'N/A'}</span></div>
            <div><span class="label">Server URL:</span> <span class="value">${mcp.serverUrl || 'N/A'}</span></div>
            <div><span class="label">MCP Endpoint:</span> <span class="value">${mcp.sseEndpoint || 'N/A'}</span></div>
            <div><span class="label">Required VS Code:</span> <span class="value">${mcp.requiredVscodeVersion || 'N/A'}</span></div>
        </div>
    </div>

    <h2>🖇️ Process Environment Variables</h2>
    <div class="card" style="max-width: 100%;">
        <div class="env-list">
            ${this._renderEnv(m.env)}
        </div>
    </div>

    <h2>🧭 Resolution Attempts</h2>
    <div class="card" style="max-width: 100%;">
        <div class="env-list">
            ${this._renderAttempts(attempts)}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
    </script>
</body>
</html>`;
    }

    private _getStartupModeSummary(startupMode: unknown): { label: string; description: string } {
        const mode = String(startupMode || '').trim().toLowerCase();
        if (mode === 'bundled-ts-service') {
            return {
                label: 'bundled-ts-service',
                description: 'Extension-managed local Node service from bundled agentchatbus-ts runtime.',
            };
        }
        if (mode === 'external-service') {
            return {
                label: 'external-service',
                description: 'External backend process detected by health probe and attached by this extension.',
            };
        }
        return {
            label: mode || 'N/A',
            description: 'Unknown mode. Extension currently documents bundled-ts-service and external-service.',
        };
    }

    private _getBackendSummary(engine: unknown, startupMode: unknown): string {
        const normalizedEngine = String(engine || '').trim().toLowerCase();
        if (normalizedEngine === 'node') return 'Node.js';
        if (normalizedEngine === 'python') return 'Python';

        const mode = String(startupMode || '').trim().toLowerCase();
        if (mode === 'bundled-ts-service') return 'Node.js';
        return 'Unknown';
    }

    private _renderEnv(env: any) {
        if (!env) return '<div class="value">No environment overrides detected.</div>';
        
        // Show all env for maximum geek factor
        return Object.entries(env)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, val]) => `
                <div class="env-item">
                    <span class="env-key">${key}</span>
                    <span class="env-val" title="${val}">${val}</span>
                </div>
            `).join('');
    }

    private _renderAttempts(attempts: string[]) {
        if (attempts.length === 0) {
            return '<div class="value">No recorded resolution attempts.</div>';
        }

        return attempts
            .map(entry => `
                <div class="env-item">
                    <span class="env-key">step</span>
                    <span class="env-val" title="${entry}">${entry}</span>
                </div>
            `)
            .join('');
    }

    private _getUptime(startTime: Date): string {
        const diff = Date.now() - startTime.getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}
