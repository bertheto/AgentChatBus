"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanel = void 0;
const vscode = __importStar(require("vscode"));
class ChatPanel {
    static currentPanels = new Map();
    static _extensionPath = '';
    _panel;
    _thread;
    _apiClient;
    _disposables = [];
    // Sync context state
    _currentSeq = 0;
    _replyToken = '';
    constructor(panel, thread, apiClient) {
        this._panel = panel;
        this._thread = thread;
        this._apiClient = apiClient;
        this._update();
        this._loadInitialMessages();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this._handleSendMessage(message.text);
                    return;
            }
        }, null, this._disposables);
        // Listen for SSE messages
        this._apiClient.onSseEvent.event(async (e) => {
            if (e.type === 'msg.new' && e.payload && e.payload.thread_id === this._thread.id) {
                // Ignore if we already have this seq locally
                if (e.payload.seq <= this._currentSeq)
                    return;
                await this._loadNewMessages();
            }
        });
    }
    static setExtensionPath(path) {
        ChatPanel._extensionPath = path;
    }
    static createOrShow(thread, apiClient) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (ChatPanel.currentPanels.has(thread.id)) {
            ChatPanel.currentPanels.get(thread.id)._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('agentChatBusChat', `ACB: ${thread.topic || thread.id.substring(0, 8)}`, column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(ChatPanel._extensionPath)
            ]
        });
        ChatPanel.currentPanels.set(thread.id, new ChatPanel(panel, thread, apiClient));
    }
    async _loadInitialMessages() {
        try {
            const wrapper = await this._apiClient.getMessages(this._thread.id);
            const messages = Array.isArray(wrapper) ? wrapper : (wrapper.messages || []);
            if (messages.length > 0) {
                this._currentSeq = messages[messages.length - 1].seq;
            }
            if (!Array.isArray(wrapper)) {
                if (wrapper.current_seq)
                    this._currentSeq = wrapper.current_seq;
                if (wrapper.reply_token)
                    this._replyToken = wrapper.reply_token;
            }
            this._panel.webview.postMessage({ command: 'loadMessages', messages: messages });
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to load messages: ${e.message}`);
        }
    }
    async _loadNewMessages() {
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
                if (wrapper.reply_token)
                    this._replyToken = wrapper.reply_token;
            }
        }
        catch (e) {
            console.error(`Failed to load new messages: ${e.message}`);
        }
    }
    _pushMessage(message) {
        this._panel.webview.postMessage({ command: 'newMessage', message: message });
    }
    async _handleSendMessage(text) {
        if (!text.trim())
            return;
        try {
            // In AgentChatBus, we need a valid reply token to send messages.
            const sync = await this._apiClient.getSyncContext(this._thread.id);
            const m = await this._apiClient.sendMessage(this._thread.id, text, sync);
            if (m && m.seq > this._currentSeq) {
                this._currentSeq = m.seq;
                this._pushMessage(m);
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to send message: ${e.message}`);
        }
    }
    dispose() {
        ChatPanel.currentPanels.delete(this._thread.id);
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }
    _getHtmlForWebview() {
        const webview = this._panel.webview;
        // Resource paths
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(ChatPanel._extensionPath), 'resources', 'media', 'messageRenderer.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(ChatPanel._extensionPath), 'resources', 'media', 'messageRenderer.css'));
        const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(ChatPanel._extensionPath), 'resources', 'media', 'mermaid.min.js'));
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
            <link rel="stylesheet" href="${styleUri}">
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
                    overflow: hidden;
                }
                #message-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }
                .message-wrapper {
                    display: flex;
                    gap: 10px;
                    max-width: 92%;
                    align-items: flex-start;
                }
                .message-wrapper.human {
                    align-self: flex-end;
                    flex-direction: row-reverse;
                }
                .avatar {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 6px;
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .message-content-wrapper {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                .message-wrapper.human .message-content-wrapper {
                    align-items: flex-end;
                }
                .message {
                    padding: 8px 12px;
                    border-radius: 10px;
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-panel-border);
                    font-size: 13px;
                    line-height: 1.5;
                }
                .message-wrapper.human .message {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                }
                .message-header {
                    font-size: 11px;
                    opacity: 0.7;
                    margin-bottom: 2px;
                    display: flex;
                    gap: 6px;
                }
                #input-container {
                    padding: 12px;
                    background: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }
                #message-input {
                    flex: 1;
                    padding: 8px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    resize: none;
                    min-height: 20px;
                    max-height: 150px;
                }
                #send-button {
                    padding: 6px 14px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 12px;
                    height: 32px;
                }
                #send-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body data-theme="${vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light'}">
            <div id="message-container"></div>
            <div id="input-container">
                <textarea id="message-input" rows="1" placeholder="Type a message..."></textarea>
                <button id="send-button">Send</button>
            </div>

            <script src="${mermaidUri}"></script>
            <script src="${scriptUri}"></script>
            <script>
                const vscode = acquireVsCodeApi();
                const messageContainer = document.getElementById('message-container');
                const messageInput = document.getElementById('message-input');
                const sendButton = document.getElementById('send-button');

                console.log('[ACB Chat] Webview loaded');
                window.addEventListener('load', () => {
                    console.log('[ACB Chat] window.AcbMessageRenderer:', !!window.AcbMessageRenderer);
                    if (!window.AcbMessageRenderer) {
                        console.error('[ACB Chat] Message renderer failed to load!');
                    }
                });

                // Auto-resize textarea
                messageInput.addEventListener('input', () => {
                    messageInput.style.height = 'auto';
                    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
                });

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
                    
                    // Use the consolidated renderer
                    if (window.AcbMessageRenderer) {
                        try {
                            const metadata = msg.metadata || {};
                            AcbMessageRenderer.renderMessageContent(content, msg.content, metadata);
                        } catch (e) {
                            console.error('Renderer error:', e);
                            content.textContent = msg.content;
                        }
                    } else {
                        content.textContent = msg.content;
                    }
                    
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
                            if (window.AcbMessageRenderer) {
                                AcbMessageRenderer.renderMermaidBlocks(messageContainer);
                            }
                            messageContainer.scrollTop = messageContainer.scrollHeight;
                            break;
                        case 'newMessage':
                            renderMessage(message.message);
                            if (window.AcbMessageRenderer) {
                                AcbMessageRenderer.renderMermaidBlocks(messageContainer);
                            }
                            messageContainer.scrollTop = messageContainer.scrollHeight;
                            break;
                    }
                });

                function sendMessage() {
                    const text = messageInput.value.trim();
                    if (text) {
                        vscode.postMessage({
                            command: 'sendMessage',
                            text: text
                        });
                        messageInput.value = '';
                        messageInput.style.height = 'auto';
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
exports.ChatPanel = ChatPanel;
//# sourceMappingURL=chatPanel.js.map