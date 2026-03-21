#!/usr/bin/env node

import { chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const extensionRoot = path.join(repoRoot, 'vscode-agentchatbus');
const bundledServerRoot = path.join(extensionRoot, 'resources', 'bundled-server');
const bundledWebUiRoot = path.join(extensionRoot, 'resources', 'web-ui');
const pythonDistRoot = path.join(repoRoot, 'dist');
const bundleWorkRoot = path.join(pythonDistRoot, 'release-bundle');
const tsServerRoot = path.join(repoRoot, 'agentchatbus-ts');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, inlineValue] = arg.split('=', 2);
    const nextValue = argv[index + 1];
    if (inlineValue !== undefined) {
      args[flag] = inlineValue;
      continue;
    }
    if (nextValue && !nextValue.startsWith('--')) {
      args[flag] = nextValue;
      index += 1;
      continue;
    }
    args[flag] = 'true';
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function ensureDirectory(pathToCreate) {
  await mkdir(pathToCreate, { recursive: true });
}

async function ensureSourceExists(targetPath, label) {
  try {
    await stat(targetPath);
  } catch {
    throw new Error(`${label} is missing: ${targetPath}`);
  }
}

async function copyFile(sourcePath, targetPath) {
  await ensureDirectory(path.dirname(targetPath));
  await cp(sourcePath, targetPath, { force: true });
}

async function copyDirectory(sourcePath, targetPath) {
  await ensureDirectory(path.dirname(targetPath));
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
  });
}

function renderRootReadme({ extensionVersion, bundleDirName }) {
  return `# AgentChatBus Standalone Node Server

Version: ${extensionVersion}
Folder: ${bundleDirName}

This archive contains the standalone CommonJS Node backend and bundled web UI used by the AgentChatBus VS Code extension.

## Separate VS Code extension asset

The VS Code extension is published separately on the same GitHub release page as:

\`agentchatbus-${extensionVersion}.vsix\`

Install that file in VS Code or Cursor if you want the editor integration.

## Contents

- \`dist/cli/index.js\` - bundled Node entry point
- \`package.json\` - CommonJS runtime manifest
- \`web-ui/\` - browser UI assets served by the backend
- \`start.ps1\` - PowerShell launcher
- \`start.sh\` - POSIX launcher
- \`EXTERNAL_SERVER_QUICKSTART.md\` - detailed manual startup guide
- \`LICENSE\` and \`LICENSES-vendor.md\`

## Quick start

PowerShell:

\`\`\`powershell
.\\start.ps1
\`\`\`

Bash:

\`\`\`bash
./start.sh
\`\`\`

Default backend address:

\`http://127.0.0.1:39765\`

Use Node.js 20 or newer.
`;
}

function renderStartPs1() {
  return `param(
    [string]$ListenHost = $(if ($env:AGENTCHATBUS_HOST) { $env:AGENTCHATBUS_HOST } else { "127.0.0.1" }),
    [int]$Port = $(if ($env:AGENTCHATBUS_PORT) { [int]$env:AGENTCHATBUS_PORT } else { 39765 })
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$EntryPoint = Join-Path $ScriptDir "dist\\cli\\index.js"

node $EntryPoint serve "--host=$ListenHost" "--port=$Port"
exit $LASTEXITCODE
`;
}

function renderStartSh() {
  return `#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
HOST="\${AGENTCHATBUS_HOST:-127.0.0.1}"
PORT="\${AGENTCHATBUS_PORT:-39765}"

exec node "$SCRIPT_DIR/dist/cli/index.js" serve "--host=$HOST" "--port=$PORT"
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const extensionPackageJson = await readJson(path.join(extensionRoot, 'package.json'));
  const extensionVersion = extensionPackageJson.version;
  const bundleVersion = args['--bundle-version'] || extensionVersion;
  const bundleDirName = `AgentChatBus-standalone-node-server-${bundleVersion}`;
  const bundleRoot = path.join(bundleWorkRoot, bundleDirName);
  const standaloneQuickstartSource = path.join(tsServerRoot, 'EXTERNAL_SERVER_QUICKSTART.md');
  const bundledPackageJson = path.join(bundledServerRoot, 'package.json');
  const bundledDist = path.join(bundledServerRoot, 'dist');

  for (const [sourcePath, label] of [
    [bundledPackageJson, 'bundled server package.json'],
    [bundledDist, 'bundled server dist directory'],
    [bundledWebUiRoot, 'bundled web-ui directory'],
    [standaloneQuickstartSource, 'standalone quickstart document'],
    [path.join(repoRoot, 'LICENSE'), 'repository LICENSE'],
    [path.join(repoRoot, 'LICENSES-vendor.md'), 'third-party license notes'],
  ]) {
    await ensureSourceExists(sourcePath, label);
  }

  await rm(bundleRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });

  await ensureDirectory(bundleRoot);

  await copyFile(path.join(repoRoot, 'LICENSE'), path.join(bundleRoot, 'LICENSE'));
  await copyFile(path.join(repoRoot, 'LICENSES-vendor.md'), path.join(bundleRoot, 'LICENSES-vendor.md'));
  await copyFile(bundledPackageJson, path.join(bundleRoot, 'package.json'));
  await copyDirectory(bundledDist, path.join(bundleRoot, 'dist'));
  await copyDirectory(bundledWebUiRoot, path.join(bundleRoot, 'web-ui'));
  await copyFile(standaloneQuickstartSource, path.join(bundleRoot, 'EXTERNAL_SERVER_QUICKSTART.md'));
  await writeFile(path.join(bundleRoot, 'README.md'), renderRootReadme({ extensionVersion, bundleDirName }), 'utf8');
  await writeFile(path.join(bundleRoot, 'start.ps1'), renderStartPs1(), 'utf8');
  await writeFile(path.join(bundleRoot, 'start.sh'), renderStartSh(), 'utf8');

  if (process.platform !== 'win32') {
    try {
      const startShPath = path.join(bundleRoot, 'start.sh');
      await chmod(startShPath, 0o755);
    } catch {
      // Best-effort permission adjustment only.
    }
  }

  console.log('[release-bundle] assembled standalone node server staging directory');
  console.log(`  - package root: ${path.relative(repoRoot, bundleRoot)}`);
  console.log(`  - runtime dist: ${path.relative(repoRoot, path.join(bundleRoot, 'dist'))}`);
  console.log(`  - runtime web-ui: ${path.relative(repoRoot, path.join(bundleRoot, 'web-ui'))}`);
  console.log(`  - root readme: ${path.relative(repoRoot, path.join(bundleRoot, 'README.md'))}`);
}

main().catch((error) => {
  console.error(
    '[release-bundle] failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
