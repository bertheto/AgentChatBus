#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "vscode-agentchatbus");
const extensionPackagePath = path.join(extensionRoot, "package.json");
const tsPackagePath = path.join(repoRoot, "agentchatbus-ts", "package.json");
const pyprojectPath = path.join(repoRoot, "pyproject.toml");
const tsEnvPath = path.join(repoRoot, "agentchatbus-ts", "src", "core", "config", "env.ts");

function printUsage() {
  console.log(`Usage:
  node scripts/bump-version.mjs <version|patch|minor|major> [--dry-run] [--publish] [--remote <name>] [--branch <name>]

Examples:
  node scripts/bump-version.mjs 0.2.6
  node scripts/bump-version.mjs patch
  node scripts/bump-version.mjs minor --dry-run
  node scripts/bump-version.mjs 0.2.6 --publish
`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readCurrentExtensionVersion() {
  const pkg = readJson(extensionPackagePath);
  return String(pkg.version || "").trim();
}

function readCurrentPyprojectVersion() {
  const source = readFileSync(pyprojectPath, "utf8");
  const match = source.match(/^version = "([^"]+)"$/m);
  return match ? match[1] : "";
}

function readCurrentTsEnvVersion() {
  const source = readFileSync(tsEnvPath, "utf8");
  const match = source.match(/export const BUS_VERSION = "([^"]+)";/);
  return match ? match[1] : "";
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function bumpSemver(version, kind) {
  const [major, minor, patch] = version.split(".").map((part) => Number(part));
  if (![major, minor, patch].every(Number.isInteger)) {
    throw new Error(`Invalid current version: ${version}`);
  }
  if (kind === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }
  if (kind === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  if (kind === "major") {
    return `${major + 1}.0.0`;
  }
  throw new Error(`Unsupported bump kind: ${kind}`);
}

function parseArgs(argv) {
  const args = {
    target: "",
    dryRun: false,
    help: false,
    publish: false,
    remote: "origin",
    branch: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--publish") {
      args.publish = true;
      continue;
    }
    if (arg === "--remote") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--remote requires a value");
      }
      args.remote = value;
      index += 1;
      continue;
    }
    if (arg === "--branch") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--branch requires a value");
      }
      args.branch = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h" || arg === "/?") {
      args.help = true;
      continue;
    }
    if (!args.target) {
      args.target = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return args;
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? -1}`));
    });
  });
}

async function runCommandCapture(command, args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? -1}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

function resolveCommand(command) {
  if (process.platform !== "win32") {
    return command;
  }
  if (command === "npm") {
    return "npm.cmd";
  }
  if (command === "npx") {
    return "npx.cmd";
  }
  return command;
}

function resolveVersionTarget(currentVersion, target) {
  if (["patch", "minor", "major"].includes(target)) {
    return {
      npmVersionArg: target,
      nextVersion: bumpSemver(currentVersion, target),
      mode: "bump",
    };
  }

  if (!isSemver(target)) {
    throw new Error(`Target must be a semver like 0.2.6 or one of patch/minor/major. Received: ${target}`);
  }

  return {
    npmVersionArg: target,
    nextVersion: target,
    mode: "set",
  };
}

function verifySynchronizedVersion(expectedVersion) {
  const extensionVersion = readCurrentExtensionVersion();
  const tsVersion = String(readJson(tsPackagePath).version || "").trim();
  const pyprojectVersion = readCurrentPyprojectVersion();
  const tsEnvVersion = readCurrentTsEnvVersion();

  const mismatches = [
    ["vscode-agentchatbus/package.json", extensionVersion],
    ["agentchatbus-ts/package.json", tsVersion],
    ["pyproject.toml", pyprojectVersion],
    ["agentchatbus-ts/src/core/config/env.ts", tsEnvVersion],
  ].filter(([, version]) => version !== expectedVersion);

  if (mismatches.length > 0) {
    const detail = mismatches.map(([filePath, version]) => `${filePath}=${version || "<missing>"}`).join(", ");
    throw new Error(`Version synchronization failed. Expected ${expectedVersion}. Found: ${detail}`);
  }
}

async function getCurrentBranch() {
  return await runCommandCapture("git", ["branch", "--show-current"], repoRoot);
}

async function getWorktreeStatus() {
  return await runCommandCapture("git", ["status", "--porcelain"], repoRoot);
}

async function ensurePublishPreconditions(targetVersion, remote, branch) {
  const status = await getWorktreeStatus();
  if (status) {
    throw new Error(
      "Publish mode requires a clean git worktree before bumping. Commit or stash existing changes first.",
    );
  }

  const remotes = await runCommandCapture("git", ["remote"], repoRoot);
  const remoteNames = remotes.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (!remoteNames.includes(remote)) {
    throw new Error(`Remote '${remote}' does not exist. Available remotes: ${remoteNames.join(", ")}`);
  }

  const existingTags = await runCommandCapture("git", ["tag", "--list", `v${targetVersion}`], repoRoot);
  if (existingTags.split(/\r?\n/).map((value) => value.trim()).includes(`v${targetVersion}`)) {
    throw new Error(`Tag v${targetVersion} already exists.`);
  }

  if (!branch) {
    throw new Error("Branch name is missing.");
  }
}

async function publishVersion(nextVersion, remote, branch) {
  const tagName = `v${nextVersion}`;
  const commitMessage = `bump version to ${nextVersion}`;

  await runCommand("git", ["add", "vscode-agentchatbus/package.json"], repoRoot);
  await runCommand("git", ["add", "vscode-agentchatbus/package-lock.json"], repoRoot);
  await runCommand("git", ["add", "agentchatbus-ts/package.json"], repoRoot);
  await runCommand("git", ["add", "agentchatbus-ts/package-lock.json"], repoRoot);
  await runCommand("git", ["add", "agentchatbus-ts/src/core/config/env.ts"], repoRoot);
  await runCommand("git", ["add", "pyproject.toml"], repoRoot);
  await runCommand("git", ["commit", "-m", commitMessage], repoRoot);
  await runCommand("git", ["tag", "-a", tagName, "-m", `Release ${tagName}`], repoRoot);
  await runCommand("git", ["push", remote, branch], repoRoot);
  await runCommand("git", ["push", remote, tagName], repoRoot);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const currentVersion = readCurrentExtensionVersion();
  if (!isSemver(currentVersion)) {
    throw new Error(`Current extension version is invalid: ${currentVersion}`);
  }

  const resolved = resolveVersionTarget(currentVersion, args.target);
  const branch = args.branch || (await getCurrentBranch());

  console.log(`[bump-version] current version: ${currentVersion}`);
  console.log(`[bump-version] target version: ${resolved.nextVersion}`);
  console.log(`[bump-version] mode: ${resolved.mode}`);
  console.log(`[bump-version] publish: ${args.publish ? "yes" : "no"}`);
  console.log(`[bump-version] remote: ${args.remote}`);
  console.log(`[bump-version] branch: ${branch}`);

  if (args.dryRun) {
    console.log("[bump-version] dry run only, no files were changed.");
    console.log("");
    console.log("Planned commands:");
    console.log(`  1. cd vscode-agentchatbus && npm version ${resolved.npmVersionArg} --no-git-tag-version`);
    console.log("  2. node ./vscode-agentchatbus/scripts/sync-versions.mjs");
    if (args.publish) {
      console.log("  3. git add <version files>");
      console.log(`  4. git commit -m "bump version to ${resolved.nextVersion}"`);
      console.log(`  5. git tag -a v${resolved.nextVersion} -m "Release v${resolved.nextVersion}"`);
      console.log(`  6. git push ${args.remote} ${branch}`);
      console.log(`  7. git push ${args.remote} v${resolved.nextVersion}`);
      console.log("");
      console.log("Result:");
      console.log("  Pushing the tag will trigger the GitHub release workflow.");
      return;
    }
    console.log("");
    console.log("Suggested follow-up:");
    console.log(`  git commit -am "bump version to ${resolved.nextVersion}"`);
    console.log(`  git tag v${resolved.nextVersion}`);
    return;
  }

  if (args.publish) {
    await ensurePublishPreconditions(resolved.nextVersion, args.remote, branch);
  }

  await runCommand("npm", ["version", resolved.npmVersionArg, "--no-git-tag-version"], extensionRoot);
  await runCommand("node", ["./scripts/sync-versions.mjs"], extensionRoot);
  verifySynchronizedVersion(resolved.nextVersion);

  console.log("[bump-version] synchronized versions successfully.");
  if (args.publish) {
    await publishVersion(resolved.nextVersion, args.remote, branch);
    console.log("[bump-version] pushed commit and tag successfully.");
    console.log(`[bump-version] GitHub release workflow should now run for v${resolved.nextVersion}.`);
    return;
  }

  console.log("");
  console.log("Next commands:");
  console.log("  git status --short");
  console.log(`  git commit -am "bump version to ${resolved.nextVersion}"`);
  console.log(`  git tag v${resolved.nextVersion}`);
  console.log(`  git push ${args.remote} ${branch} --follow-tags`);
}

main().catch((error) => {
  console.error("[bump-version] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
