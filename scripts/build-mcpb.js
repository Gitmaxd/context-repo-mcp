#!/usr/bin/env node

/**
 * Build script for Claude Desktop Extension (.mcpb)
 *
 * This script:
 * 1. Creates the claude-extension/server/ directory
 * 2. Copies src/index.js to claude-extension/server/index.js
 * 3. Installs production dependencies into claude-extension/node_modules/
 * 4. Syncs version from package.json to manifest.json
 * 5. Runs `mcpb pack` to generate the .mcpb file
 */

import { execSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const EXTENSION_DIR = join(ROOT_DIR, "claude-extension");
const SERVER_DIR = join(EXTENSION_DIR, "server");

function log(message) {
  console.log(`[build-mcpb] ${message}`);
}

function error(message) {
  console.error(`[build-mcpb] ERROR: ${message}`);
  process.exit(1);
}

function run(command, options = {}) {
  log(`Running: ${command}`);
  try {
    execSync(command, { stdio: "inherit", ...options });
  } catch (e) {
    error(`Command failed: ${command}`);
  }
}

async function main() {
  log("Starting Claude Desktop Extension build...");

  // 1. Read version from package.json
  const packageJsonPath = join(ROOT_DIR, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const version = packageJson.version;
  log(`Version: ${version}`);

  // 2. Create server directory
  log("Creating server directory...");
  mkdirSync(SERVER_DIR, { recursive: true });

  // 3. Copy server code
  log("Copying server code...");
  copyFileSync(join(ROOT_DIR, "src", "index.js"), join(SERVER_DIR, "index.js"));

  // 4. Update manifest.json version
  log("Updating manifest.json version...");
  const manifestPath = join(EXTENSION_DIR, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.version = version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // 5. Install production dependencies in claude-extension
  log("Installing production dependencies...");
  
  // Create a minimal package.json for the extension
  const extensionPackageJson = {
    name: "context-repo-claude-extension",
    version: version,
    type: "module",
    dependencies: packageJson.dependencies,
  };
  writeFileSync(
    join(EXTENSION_DIR, "package.json"),
    JSON.stringify(extensionPackageJson, null, 2) + "\n"
  );

  run("npm install --production", { cwd: EXTENSION_DIR });

  // 6. Check for icon
  const iconPath = join(EXTENSION_DIR, "icon.png");
  if (!existsSync(iconPath)) {
    log("WARNING: icon.png not found. Creating placeholder...");
    log("Please replace claude-extension/icon.png with your actual icon (128x128 PNG)");
    // Create a simple 1x1 transparent PNG as placeholder
    const transparentPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    writeFileSync(iconPath, transparentPng);
  }

  // 7. Run mcpb pack
  log("Packing extension with mcpb...");
  run("npx @anthropic-ai/mcpb pack", { cwd: EXTENSION_DIR });

  // 8. Move .mcpb file to root with proper naming
  const targetFileName = `context-repo-${version}.mcpb`;
  const targetMcpb = join(ROOT_DIR, targetFileName);
  
  // Find the generated .mcpb file (mcpb uses directory name for output)
  const files = readdirSync(EXTENSION_DIR);
  const generatedMcpbFile = files.find((f) => f.endsWith(".mcpb"));
  
  if (generatedMcpbFile) {
    copyFileSync(join(EXTENSION_DIR, generatedMcpbFile), targetMcpb);
    log(`Created: ${targetFileName}`);
  } else {
    error("No .mcpb file was generated");
  }

  log("Build complete!");
  log("");
  log("Next steps:");
  log("1. Replace claude-extension/icon.png with your actual icon");
  log("2. Double-click the .mcpb file to test installation in Claude Desktop");
  log("3. Create a GitHub release to distribute the extension");
}

main().catch((e) => {
  error(e.message);
});
