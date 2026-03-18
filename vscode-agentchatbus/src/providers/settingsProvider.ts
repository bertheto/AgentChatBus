import * as vscode from 'vscode';
import { getTreeIcon } from '../ui/treeIcons';

export class SettingsProvider implements vscode.TreeDataProvider<SettingItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingItem | undefined | void> = new vscode.EventEmitter<SettingItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingItem | undefined | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: SettingItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingItem): vscode.ProviderResult<SettingItem[]> {
        if (element) return [];

        return [
            new SettingItem(
                "MCP Integration Status",
                "Inspect MCP provider registration, transport, and target endpoint",
                "mgmt-mcp-status.svg",
                "agentchatbus.showMcpStatus"
            ),
            new SettingItem(
                "Configure Cursor MCP",
                "Update Cursor's global mcp.json with an AgentChatBus SSE entry",
                "mgmt-cursor-configure.svg",
                "agentchatbus.configureCursorMcp"
            ),
            new SettingItem(
                "Open Cursor MCP Config",
                "Open Cursor's global mcp.json for inspection",
                "mgmt-cursor-open.svg",
                "agentchatbus.openCursorMcpConfig"
            ),
            new SettingItem(
                "Open Web Console", 
                "Open the AgentChatBus dashboard in your browser", 
                "mgmt-web-console.svg", 
                "agentchatbus.openWebConsole"
            ),
            new SettingItem(
                "Server Settings", 
                "Configure AgentChatBus server parameters", 
                "mgmt-server-settings.svg", 
                "agentchatbus.serverSettings"
            )
        ];
    }
}

class SettingItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly iconFile: string,
        public readonly commandId: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = tooltip;
        this.iconPath = getTreeIcon(iconFile);
        this.command = {
            title: label,
            command: commandId
        };
        this.contextValue = 'setting';
    }
}
