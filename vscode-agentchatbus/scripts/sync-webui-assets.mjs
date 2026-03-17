#!/usr/bin/env node

import { cp, mkdir, copyFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..');
const tsServerRoot = path.join(repoRoot, 'agentchatbus-ts');
const bundledServerRoot = path.join(extensionRoot, 'resources', 'bundled-server');
const bundledWebUiRoot = path.join(extensionRoot, 'resources', 'web-ui');

const mappings = [
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'media', 'chatPanel.js'),
    to: path.join(extensionRoot, 'resources', 'media', 'chatPanel.js'),
    label: 'extension chat panel script',
  },
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'media', 'chatPanel.css'),
    to: path.join(extensionRoot, 'resources', 'media', 'chatPanel.css'),
    label: 'extension chat panel style',
  },
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'media', 'messageRenderer.js'),
    to: path.join(extensionRoot, 'resources', 'media', 'messageRenderer.js'),
    label: 'extension message renderer script',
  },
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'media', 'messageRenderer.css'),
    to: path.join(extensionRoot, 'resources', 'media', 'messageRenderer.css'),
    label: 'extension message renderer style',
  },
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'media', 'mermaid.min.js'),
    to: path.join(extensionRoot, 'resources', 'media', 'mermaid.min.js'),
    label: 'mermaid vendor',
  },
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'index.html'),
    to: path.join(extensionRoot, 'resources', 'webui-extension', 'index.html'),
    label: 'extension debug html',
  },
  {
    from: path.join(repoRoot, 'web-ui', 'extension', 'media', 'vscodeBridgeBrowser.js'),
    to: path.join(extensionRoot, 'resources', 'webui-extension', 'vscodeBridgeBrowser.js'),
    label: 'extension debug browser bridge',
  },
];

async function ensureParentDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function copyOne(entry) {
  await ensureParentDir(entry.to);
  await copyFile(entry.from, entry.to);
  const copied = await stat(entry.to);
  return {
    ...entry,
    size: copied.size,
  };
}

async function runTsServerBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: tsServerRoot,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`agentchatbus-ts build failed with exit code ${code ?? -1}`));
    });
  });
}

async function syncDirectory(from, to, label) {
  await rm(to, { recursive: true, force: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, {
    recursive: true,
    force: true,
    filter: (source) => {
      const baseName = path.basename(source);
      return baseName !== 'README.md';
    },
  });
  return { label, from, to };
}

async function writeBundledServerPackageJson() {
  await mkdir(bundledServerRoot, { recursive: true });
  const packageJsonPath = path.join(bundledServerRoot, 'package.json');
  const packageJson = {
    type: 'module',
    private: true,
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  return packageJsonPath;
}

async function main() {
  console.log('[sync:webui-assets] building agentchatbus-ts...');
  await runTsServerBuild();

  const copied = [];
  for (const mapping of mappings) {
    copied.push(await copyOne(mapping));
  }

  const syncedDirectories = [];
  syncedDirectories.push(await syncDirectory(path.join(tsServerRoot, 'dist'), path.join(bundledServerRoot, 'dist'), 'bundled TS server dist'));
  syncedDirectories.push(await syncDirectory(path.join(repoRoot, 'web-ui'), bundledWebUiRoot, 'bundled web-ui runtime'));
  const bundledServerPackageJson = await writeBundledServerPackageJson();

  console.log('[sync:webui-assets] copied web-ui assets to vscode extension:');
  for (const item of copied) {
    const relTo = path.relative(extensionRoot, item.to);
    console.log(`  - ${item.label}: ${relTo} (${item.size} bytes)`);
  }

  console.log('[sync:webui-assets] synchronized runtime directories:');
  for (const entry of syncedDirectories) {
    const relTo = path.relative(extensionRoot, entry.to);
    console.log(`  - ${entry.label}: ${relTo}`);
  }
  console.log(`  - bundled server package manifest: ${path.relative(extensionRoot, bundledServerPackageJson)}`);
}

main().catch((error) => {
  console.error('[sync:webui-assets] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
