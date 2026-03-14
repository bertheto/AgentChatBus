import * as vscode from 'vscode';
import type { AgentChatBusApiClient } from '../api/client';
import type { Thread, Message } from '../api/types';

export class ChatPanel {
    public static currentPanels: Map<string, ChatPanel> = new Map();
    private readonly _panel: vscode.WebviewPanel;
    private readonly _thread: Thread;
    private readonly _apiClient: AgentChatBusApiClient;
    private _disposables: vscode.Disposable[] = [];

    // Sync context state
    private _currentSeq: number = 0;
    private _replyToken: string = '';

    private constructor(panel: vscode.WebviewPanel, thread: Thread, apiClient: AgentChatBusApiClient) {
        this._panel = panel;
        this._thread = thread;
        this._apiClient = apiClient;

        this._update();
        this._loadInitialMessages();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        await this._handleSendMessage(message.text);
                        return;
                }
            },
            null,
            this._disposables
        );

        // Listen for SSE messages
        this._apiClient.onSseEvent.event(async (e) => {
            if (e.type === 'msg.new' && e.payload && e.payload.thread_id === this._thread.id) {
                // Ignore if we already have this seq locally
                if (e.payload.seq <= this._currentSeq) return;
                
                await this._loadNewMessages();
            }
        });
    }

    public static createOrShow(thread: Thread, apiClient: AgentChatBusApiClient) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ChatPanel.currentPanels.has(thread.id)) {
            ChatPanel.currentPanels.get(thread.id)!._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'agentChatBusChat',
            `ACB: ${thread.topic || thread.id.substring(0, 8)}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ChatPanel.currentPanels.set(thread.id, new ChatPanel(panel, thread, apiClient));
    }

    private async _loadInitialMessages() {
        try {
            const wrapper = await this._apiClient.getMessages(this._thread.id);
            const messages = Array.isArray(wrapper) ? wrapper : (wrapper.messages || []);
            
            if (messages.length > 0) {
                 this._currentSeq = messages[messages.length - 1].seq;
            }
            if (!Array.isArray(wrapper)) {
                if (wrapper.current_seq) this._currentSeq = wrapper.current_seq;
                if (wrapper.reply_token) this._replyToken = wrapper.reply_token;
            }

            this._panel.webview.postMessage({ command: 'loadMessages', messages: messages });
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to load messages: ${e.message}`);
        }
    }

    private async _loadNewMessages() {
        try {
            const wrapper = await this._apiClient.getMessages(this._thread.id, this._currentSeq);
            const messages = Array.isArray(wrapper) ? wrapper : (wrapper.messages || []);
            
            for (const msg of messages) {
                if (msg.seq > this._currentSeq) {
                    this._pushMessage(msg);
                    this._currentSeq = msg.seq;
                }
            }
            if (!Array.isArray(wrapper)) {
                if (wrapper.reply_token) this._replyToken = wrapper.reply_token;
            }
        } catch (e: any) {
            console.error(`Failed to load new messages: ${e.message}`);
        }
    }

    private _pushMessage(message: any) {
        this._panel.webview.postMessage({ command: 'newMessage', message: message });
    }

    private async _handleSendMessage(text: string) {
         if (!text.trim()) return;
         try {
             // In AgentChatBus, we need a valid reply token to send messages.
             const sync = await this._apiClient.getSyncContext(this._thread.id);
             
             const m = await this._apiClient.sendMessage(this._thread.id, text, sync);
             
             if (m && m.seq > this._currentSeq) {
                 this._currentSeq = m.seq;
                 this._pushMessage(m);
             }
             
         } catch (e: any) {
             vscode.window.showErrorMessage(`Failed to send message: ${e.message}`);
         }
    }

    public dispose() {
        ChatPanel.currentPanels.delete(this._thread.id);
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) { x.dispose(); }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    margin: 0;
                    padding: 0;
                }
                #message-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .message-wrapper {
                    display: flex;
                    gap: 12px;
                    max-width: 85%;
                }
                .message-wrapper.human {
                    align-self: flex-end;
                    flex-direction: row-reverse;
                }
                .avatar {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 50%;
                    flex-shrink: 0;
                    margin-top: 4px;
                }
                .message-content-wrapper {
                    display: flex;
                    flex-direction: column;
                }
                .message-wrapper.human .message-content-wrapper {
                    align-items: flex-end;
                }
                .message {
                    padding: 10px 14px;
                    border-radius: 12px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-panel-border);
                }
                .message-wrapper.human .message {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                }
                .message-header {
                    font-size: 0.8em;
                    opacity: 0.7;
                    margin-bottom: 4px;
                    display: flex;
                    gap: 8px;
                }
                #input-container {
                    padding: 16px;
                    background: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    gap: 8px;
                }
                #message-input {
                    flex: 1;
                    padding: 10px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    font-family: var(--vscode-font-family);
                    resize: none;
                }
                button {
                    padding: 8px 20px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div id="message-container"></div>
            <div id="input-container">
                <textarea id="message-input" rows="1" placeholder="Type a message..."></textarea>
                <button id="send-button">Send</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const messageContainer = document.getElementById('message-container');
                const messageInput = document.getElementById('message-input');
                const sendButton = document.getElementById('send-button');

                function renderMessage(msg) {
                    const isHuman = /human/i.test(msg.author) || /human/i.test(msg.role);
                    
                    const wrapper = document.createElement('div');
                    wrapper.className = 'message-wrapper' + (isHuman ? ' human' : '');
                    
                    const avatar = document.createElement('div');
                    avatar.className = 'avatar';
                    avatar.textContent = msg.author_emoji || (isHuman ? '👤' : '🤖');
                    
                    const contentWrapper = document.createElement('div');
                    contentWrapper.className = 'message-content-wrapper';
                    
                    const header = document.createElement('div');
                    header.className = 'message-header';
                    
                    const authorSpan = document.createElement('span');
                    authorSpan.style.fontWeight = 'bold';
                    authorSpan.textContent = msg.author || 'system';
                    
                    const timeSpan = document.createElement('span');
                    timeSpan.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    header.appendChild(authorSpan);
                    header.appendChild(timeSpan);
                    
                    const content = document.createElement('div');
                    content.className = 'message';
                    content.textContent = msg.content;
                    
                    contentWrapper.appendChild(header);
                    contentWrapper.appendChild(content);
                    
                    wrapper.appendChild(avatar);
                    wrapper.appendChild(contentWrapper);
                    
                    messageContainer.appendChild(wrapper);
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'loadMessages':
                            messageContainer.innerHTML = '';
                            const msgs = Array.isArray(message.messages) ? message.messages : (message.messages.messages || []);
                            msgs.forEach(renderMessage);
                            messageContainer.scrollTop = messageContainer.scrollHeight;
                            break;
                        case 'newMessage':
                            renderMessage(message.message);
                            messageContainer.scrollTop = messageContainer.scrollHeight;
                            break;
                    }
                });

                function sendMessage() {
                    const text = messageInput.value;
                    if (text) {
                        vscode.postMessage({
                            command: 'sendMessage',
                            text: text
                        });
                        messageInput.value = '';
                    }
                }

                sendButton.addEventListener('click', sendMessage);
                messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
