import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gridcraftExe = findGridCraft();
const viteEntry = resolve(repoRoot, "node_modules/vite/bin/vite.js");
const portArgument = process.argv.indexOf("--port");
const gridcraftControlPort = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 7979;
const beboUrl = "http://127.0.0.1:3000/";

if (!Number.isInteger(gridcraftControlPort) || gridcraftControlPort < 1 || gridcraftControlPort > 65_535) {
  throw new Error("Use --port followed by a valid port number from 1 to 65535.");
}

function findGridCraft() {
  if (process.platform !== "win32") {
    throw new Error("This one-command launcher is for Windows. Start GridCraft with --control 7979 and run npm run dev on other systems.");
  }

  const roots = [
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    process.env.ProgramFiles || "C:\\Program Files",
  ];
  const executable = roots.map((root) => join(root, "GridCraft", "gridcraft.exe")).find(existsSync);
  if (!executable) {
    throw new Error("GridCraft was not found under Program Files. Install GridCraft, then run this launcher again.");
  }
  return executable;
}

function portIsOpen(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolvePort(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolvePort(false);
    });
  });
}

function gridCraftIsRunning() {
  try {
    const processes = execFileSync("tasklist.exe", ["/FO", "CSV", "/NH"], { encoding: "utf8" });
    return /"gridcraft\.exe"/i.test(processes);
  } catch {
    return false;
  }
}

async function waitUntil(check, description, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function isBeboPageAvailable() {
  try {
    const response = await fetch(beboUrl, { signal: AbortSignal.timeout(1_000) });
    const html = await response.text();
    return response.ok && /<title>\s*Bebo/i.test(html);
  } catch {
    return false;
  }
}

function openBeboPage() {
  const opener = spawn("cmd.exe", ["/d", "/c", "start", "", beboUrl], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  opener.unref();
}

async function main() {
  assert(existsSync(viteEntry), "Bebo dependencies are missing. Run npm install once, then try again.");

  if (process.argv.includes("--check")) {
    console.log(`Ready: GridCraft at ${gridcraftExe}; Bebo Vite runtime is installed.`);
    return;
  }

  const beboAlreadyRunning = await isBeboPageAvailable();
  if (!beboAlreadyRunning && await portIsOpen(3000)) {
    throw new Error("Port 3000 is already in use by another app. Close it, then run this launcher again.");
  }

  if (!(await portIsOpen(gridcraftControlPort))) {
    if (gridCraftIsRunning()) {
      throw new Error("GridCraft is already open without Bebo control enabled. Save your work, close GridCraft, then run this launcher again.");
    }

    const gridcraft = spawn(gridcraftExe, ["--control", String(gridcraftControlPort)], {
      cwd: dirname(gridcraftExe),
      env: { ...process.env, WGPU_BACKEND: "gl" },
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    gridcraft.unref();
    await waitUntil(() => portIsOpen(gridcraftControlPort), "GridCraft's Bebo control port");
  } else {
    console.log(`GridCraft control is already available on port ${gridcraftControlPort}.`);
  }

  let viteProcess;
  if (!beboAlreadyRunning) {
    viteProcess = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1"], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: false,
    });
    viteProcess.once("error", (error) => console.error(`Could not start Bebo: ${error.message}`));
    viteProcess.once("exit", (code) => {
      if (code && code !== 0) console.error(`Bebo's dev server exited with code ${code}.`);
    });
    process.once("exit", () => viteProcess?.kill());
    await waitUntil(isBeboPageAvailable, "Bebo's local page");
  } else {
    console.log("Bebo's local page is already running.");
  }

  openBeboPage();
  console.log(`Bebo opened at ${beboUrl}. In Settings → Bebo for Craft apps, click Attach for GridCraft.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
