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
exports.BusServerManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
class BusServerManager {
    outputChannel;
    serverProcess = null;
    setupProvider = null;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AgentChatBus Server');
    }
    setSetupProvider(provider) {
        this.setupProvider = provider;
    }
    log(message, icon, description) {
        this.outputChannel.appendLine(`[AgentChatBus] ${message}`);
        if (this.setupProvider) {
            this.setupProvider.addLog(message, icon, description);
        }
    }
    async ensureServerRunning() {
        const config = vscode.workspace.getConfiguration('agentchatbus');
        const autoStart = config.get('autoStartBusServer', true);
        const serverUrl = config.get('serverUrl', 'http://127.0.0.1:39765');
        if (!autoStart) {
            return true;
        }
        this.log('Checking if server is already running...', 'sync~spin');
        const isRunning = await this.checkServer(serverUrl);
        if (isRunning) {
            this.log('Server is already running.', 'check');
            this.setServerReady(true);
            return true;
        }
        this.log('Server not detected. Starting setup...', 'info');
        const started = await this.startServer();
        if (started) {
            this.setServerReady(true);
            return true;
        }
        return false;
    }
    setServerReady(ready) {
        vscode.commands.executeCommand('setContext', 'agentchatbus:serverReady', ready);
    }
    async checkServer(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            const response = await fetch(`${url}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async startServer() {
        const projectRoot = this.findProjectRoot();
        const config = vscode.workspace.getConfiguration('agentchatbus');
        let pythonPath = config.get('pythonPath', 'python');
        // Case 1: In a project workspace
        if (projectRoot) {
            this.log('Detected project workspace.', 'folder');
            // Auto-detect .venv if pythonPath is default
            if (pythonPath === 'python') {
                this.log('Searching for virtual environment...', 'search');
                const venvPath = path.join(projectRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
                if (fs.existsSync(venvPath)) {
                    pythonPath = venvPath;
                    this.log(`Using virtual env: ${pythonPath}`, 'terminal');
                }
                else {
                    this.log('No .venv found, using system python.', 'info');
                }
            }
            return await this.spawnServer(pythonPath, ['-m', 'src.main'], projectRoot);
        }
        // Case 2: Use global 'agentchatbus' command
        this.log('Searching for global "agentchatbus" command...', 'search');
        const globalCmd = await this.findAgentChatBusExecutable();
        if (globalCmd) {
            this.log(`Found global command: ${globalCmd}`, 'terminal');
            return await this.spawnServer(globalCmd, []);
        }
        // Case 3: Not found anywhere, offer to install
        this.log('AgentChatBus not found in PATH or project.', 'error');
        const selection = await vscode.window.showErrorMessage('AgentChatBus server not found. Would you like to attempt to install it via pip?', 'Install', 'Cancel');
        if (selection === 'Install') {
            const installed = await this.installAgentChatBus();
            if (installed) {
                this.log('Installation finished. Re-locating executable...', 'sync~spin');
                const newCmd = await this.findAgentChatBusExecutable();
                if (newCmd) {
                    return await this.spawnServer(newCmd, []);
                }
                else {
                    this.log('Installed but still cannot find "agentchatbus" in PATH.', 'error');
                }
            }
        }
        return false;
    }
    async spawnServer(command, args, cwd) {
        this.log(`Starting server process: ${command} ${args.join(' ')}`, 'play');
        const env = { ...process.env };
        if (cwd) {
            env.PYTHONPATH = cwd;
        }
        try {
            this.serverProcess = child_process.spawn(command, args, {
                cwd: cwd || process.cwd(),
                env,
                shell: true
            });
            this.serverProcess.stdout?.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });
            this.serverProcess.stderr?.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });
            this.serverProcess.on('error', (err) => {
                this.log(`Process spawn error: ${err.message}`, 'error');
            });
            this.serverProcess.on('close', (code) => {
                this.log(`Server process exited with code ${code}`, 'warning');
                this.serverProcess = null;
                this.setServerReady(false);
            });
            this.log('Waiting for health check...', 'sync~spin');
            const config = vscode.workspace.getConfiguration('agentchatbus');
            const serverUrl = config.get('serverUrl', 'http://127.0.0.1:39765');
            let retries = 20;
            while (retries > 0) {
                await new Promise(r => setTimeout(r, 1000));
                if (await this.checkServer(serverUrl)) {
                    this.log('Server is online and healthy.', 'check');
                    return true;
                }
                retries--;
            }
            this.log('Timeout: Server started but health check failed.', 'error');
            return false;
        }
        catch (e) {
            this.log(`Spawn error: ${e.message}`, 'error');
            return false;
        }
    }
    async findAgentChatBusExecutable() {
        // 1. Check if it's in PATH
        try {
            const cmd = process.platform === 'win32' ? 'where' : 'which';
            const out = child_process.execSync(`${cmd} agentchatbus`, { encoding: 'utf8' }).trim().split('\r\n')[0].split('\n')[0];
            if (out && fs.existsSync(out))
                return out;
        }
        catch { }
        // 2. Check Windows specific user scripts folder
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA;
            if (appData) {
                const localAppData = process.env.LOCALAPPDATA || path.join(path.dirname(appData), 'Local');
                const pythonBase = path.join(localAppData, 'Programs', 'Python');
                if (fs.existsSync(pythonBase)) {
                    const versions = fs.readdirSync(pythonBase);
                    for (const v of versions) {
                        const scriptsPath = path.join(pythonBase, v, 'Scripts', 'agentchatbus.exe');
                        if (fs.existsSync(scriptsPath))
                            return scriptsPath;
                    }
                }
                const roamingPython = path.join(appData, 'Python');
                if (fs.existsSync(roamingPython)) {
                    const versions = fs.readdirSync(roamingPython);
                    for (const v of versions) {
                        const scriptsPath = path.join(roamingPython, v, 'Scripts', 'agentchatbus.exe');
                        if (fs.existsSync(scriptsPath))
                            return scriptsPath;
                    }
                }
            }
        }
        return null;
    }
    async installAgentChatBus() {
        this.log('Running: pip install agentchatbus...', 'cloud-download');
        this.outputChannel.show();
        return new Promise((resolve) => {
            const pkg = child_process.spawn('python', ['-m', 'pip', 'install', 'agentchatbus'], { shell: true });
            pkg.stdout.on('data', (data) => this.outputChannel.append(data.toString()));
            pkg.stderr.on('data', (data) => this.outputChannel.append(data.toString()));
            pkg.on('close', (code) => {
                if (code === 0) {
                    this.log('Installation successful.', 'check');
                    resolve(true);
                }
                else {
                    this.log(`Installation failed (code ${code}).`, 'error');
                    resolve(false);
                }
            });
            pkg.on('error', (err) => {
                this.log(`Pip error: ${err.message}`, 'error');
                resolve(false);
            });
        });
    }
    findProjectRoot() {
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const mainPath = path.join(folder.uri.fsPath, 'src', 'main.py');
                if (fs.existsSync(mainPath)) {
                    return folder.uri.fsPath;
                }
            }
        }
        return null;
    }
    registerMcpProvider(context) {
        const projectRoot = this.findProjectRoot();
        if (!projectRoot)
            return;
        const lm = vscode.lm;
        if (!lm || !lm.registerMcpServerDefinitionProvider)
            return;
        const config = vscode.workspace.getConfiguration('agentchatbus');
        let pythonPath = config.get('pythonPath', 'python');
        const venvPath = path.join(projectRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
        if (fs.existsSync(venvPath)) {
            pythonPath = venvPath;
        }
        lm.registerMcpServerDefinitionProvider('agentchatbus', {
            provideMcpServerDefinitions: () => [
                new vscode.McpStdioServerDefinition({
                    label: 'AgentChatBus Bus',
                    command: pythonPath,
                    args: [path.join(projectRoot, 'stdio_main.py')],
                    cwd: projectRoot,
                    env: { PYTHONPATH: projectRoot }
                })
            ],
            resolveMcpServerDefinition: async (server) => {
                return server;
            }
        });
    }
    dispose() {
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
        this.outputChannel.dispose();
    }
}
exports.BusServerManager = BusServerManager;
//# sourceMappingURL=busServerManager.js.map