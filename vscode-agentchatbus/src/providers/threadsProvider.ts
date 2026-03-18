import * as vscode from 'vscode';
import type { AgentChatBusApiClient } from '../api/client';
import type { Thread } from '../api/types';
import { getTreeIcon } from '../ui/treeIcons';

export class ThreadsTreeProvider implements vscode.TreeDataProvider<ThreadItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ThreadItem | undefined | void> = new vscode.EventEmitter<ThreadItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ThreadItem | undefined | void> = this._onDidChangeTreeData.event;
    private _statusFilter: Set<string> = new Set(['discuss', 'implement', 'review', 'done', 'closed']);

    constructor(private apiClient: AgentChatBusApiClient) {
        apiClient.onSseEvent.event((e) => {
            if (e.type && (e.type.startsWith('thread.') || e.type === 'msg.new')) {
                this.refresh();
            }
        });
    }

    setStatusFilter(statuses: string[]) {
        this._statusFilter = new Set(statuses);
        this.refresh();
    }

    getStatusFilter(): string[] {
        return Array.from(this._statusFilter);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ThreadItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ThreadItem): Promise<ThreadItem[]> {
        if (element) {
            return [];
        }

        try {
            const includeArchived = this._statusFilter.has('archived');
            let threads = await this.apiClient.getThreads(includeArchived);
            
            // Filter by status
            threads = threads.filter(t => this._statusFilter.has(t.status));
            
            // Sort by created_at desc as a proxy for activity
            threads.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            return threads.map(t => new ThreadItem(t));
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to fetch AgentChatBus threads: ${error.message}`);
            return [];
        }
    }
}

export class ThreadItem extends vscode.TreeItem {
    constructor(
        public readonly thread: Thread
    ) {
        super(thread.topic || 'Untitled Thread', vscode.TreeItemCollapsibleState.None);

        this.tooltip = `ID: ${thread.id}\nStatus: ${thread.status}`;
        this.description = thread.status;
        this.iconPath = getThreadStatusIcon(thread.status);
        this.contextValue = `thread:${thread.status}`;
        this.command = {
            command: 'agentchatbus.openThread',
            title: 'Open Thread',
            arguments: [thread]
        };
    }
}

function getThreadStatusIcon(status: string | undefined): { light: vscode.Uri; dark: vscode.Uri } {
    switch (status) {
        case 'implement':
            return getTreeIcon('thread-implement.svg');
        case 'review':
            return getTreeIcon('thread-review.svg');
        case 'done':
            return getTreeIcon('thread-done.svg');
        case 'closed':
            return getTreeIcon('thread-closed.svg');
        case 'archived':
            return getTreeIcon('thread-archived.svg');
        case 'discuss':
        default:
            return getTreeIcon('thread-discuss.svg');
    }
}
