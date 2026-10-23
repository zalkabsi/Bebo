import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const appUrl = process.env.BEBO_DEMO_URL || "http://127.0.0.1:5173/";
const debugPort = Number(process.env.BEBO_DEMO_CDP_PORT || 9233);
const edge = process.env.BEBO_EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDir = resolve("artifacts/demo-scenes");
const profileDir = await mkdtemp(join(tmpdir(), "bebo-demo-edge-"));

if (!Number.isInteger(debugPort) || debugPort < 1024 || debugPort > 65535) {
  throw new Error("BEBO_DEMO_CDP_PORT must be an available port from 1024 to 65535.");
}

await mkdir(outputDir, { recursive: true });

const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--autoplay-policy=no-user-gesture-required",
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${debugPort}`,
  "--remote-allow-origins=*",
  "--window-size=1280,720",
  appUrl,
], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
let browserDiagnostics = "";
browser.stderr.on("data", (chunk) => { browserDiagnostics += chunk.toString(); });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForDevTools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (browser.exitCode !== null) {
      throw new Error(`Edge exited with code ${browser.exitCode}. ${browserDiagnostics}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      // Edge is still starting.
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for Edge's local DevTools endpoint.");
}

let socket;
let requestId = 0;
const pending = new Map();

try {
  const target = await waitForDevTools();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  function send(method, params = {}) {
    const id = ++requestId;
    return new Promise((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`DevTools request timed out: ${method}`));
      }, 15_000);
      pending.set(id, {
        resolve(value) { clearTimeout(timeout); resolveRequest(value); },
        reject(error) { clearTimeout(timeout); rejectRequest(error); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
  }

  async function capture(name) {
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const path = join(outputDir, `${name}.png`);
    await writeFile(path, Buffer.from(screenshot.data, "base64"));
    return path;
  }

  async function reloadApp() {
    await send("Page.navigate", { url: appUrl });
    await sleep(700);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await reloadApp();
  await sleep(600);

  const files = [];
  files.push(await capture("home"));

  const clickButton = (label) => `(() => {
    const root = document.querySelector('bebo-app')?.shadowRoot;
    const button = [...(root?.querySelectorAll('button') ?? [])].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('Could not find button: ' + ${JSON.stringify(label)});
    button.click();
    return true;
  })()`;

  await evaluate(clickButton("Plan a community project"));
  await sleep(200);
  files.push(await capture("community-plan"));

  await reloadApp();
  await evaluate(clickButton("Create a project tracker"));
  await sleep(200);
  files.push(await capture("community-tracker-prompt"));

  await reloadApp();
  await evaluate(clickButton("Draft an accessible update"));
  await sleep(200);
  files.push(await capture("accessible-update"));

  await reloadApp();
  await evaluate(`(() => {
    const root = document.querySelector('bebo-app')?.shadowRoot;
    const select = root?.querySelector('.provider-select');
    if (!select) throw new Error('Could not find the provider selector.');
    select.value = 'ollama';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  files.push(await capture("provider-ollama"));

  await evaluate(`(() => {
    const root = document.querySelector('bebo-app')?.shadowRoot;
    root?.querySelector('button[title="Settings"]')?.click();
    return true;
  })()`);
  await sleep(250);
  files.push(await capture("settings-provider"));

  await evaluate(`(() => {
    const root = document.querySelector('bebo-app')?.shadowRoot;
    const modal = root?.querySelector('.modal');
    if (!modal) throw new Error('Settings panel did not open.');
    modal.scrollTop = 400;
    return true;
  })()`);
  await sleep(150);
  files.push(await capture("settings-add-provider"));

  await evaluate(`(() => {
    const root = document.querySelector('bebo-app')?.shadowRoot;
    const modal = root?.querySelector('.modal');
    if (!modal) throw new Error('Settings panel did not open.');
    modal.scrollTop = modal.scrollHeight;
    return true;
  })()`);
  await sleep(150);
  files.push(await capture("settings-craft-apps"));

  console.log(files.join("\n"));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close"); } catch {}
  }
  try { socket?.close(); } catch {}
  await new Promise((resolveClose) => {
    if (browser.exitCode !== null) return resolveClose();
    browser.once("exit", resolveClose);
    setTimeout(resolveClose, 5000);
  });
  if (browser.exitCode === null) {
    browser.kill();
    await new Promise((resolveClose) => {
      if (browser.exitCode !== null) return resolveClose();
      browser.once("exit", resolveClose);
      setTimeout(resolveClose, 3000);
    });
  }
  const tempRoot = resolve(tmpdir()).toLowerCase();
  const profilePath = resolve(profileDir).toLowerCase();
  if (!profilePath.startsWith(tempRoot + sep.toLowerCase())) {
    throw new Error("Refusing to remove Edge profile outside the system temporary directory.");
  }
  try {
    await rm(profileDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Could not remove temporary Edge profile ${profileDir}: ${error.message}`);
  }
}
