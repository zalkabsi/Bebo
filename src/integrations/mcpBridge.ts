import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { URL } from "node:url";
import type { Plugin } from "vite";

const MAX_FRAME_CHARS = 16 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

interface McpServerConfig {
  id: string;
  label: string;
  command: string;
  args: string[];
  defaultControlPort: number;
  connectArgument: (port: number) => string;
}

type McpConnectionMode = "desktop" | "headless";

interface McpConnectionOptions {
  mode: McpConnectionMode;
  controlPort?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface McpToolResult {
  content?: { type?: string; text?: string; mimeType?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

const APP_DEFINITIONS = [
  {
    id: "wordcraft", label: "WordCraft", commandEnv: "BEBO_WORDCRAFT_CLI", legacyCommandEnv: "AIOA_WORDCRAFT_CLI",
    args: ["mcp"], defaultControlPort: 7981, connectArgument: (port: number) => `127.0.0.1:${port}`,
  },
  {
    id: "gridcraft", label: "GridCraft", commandEnv: "BEBO_GRIDCRAFT_CLI", legacyCommandEnv: "AIOA_GRIDCRAFT_CLI",
    args: ["mcp"], defaultControlPort: 7979, connectArgument: (port: number) => String(port),
  },
  {
    id: "deckcraft", label: "DeckCraft", commandEnv: "BEBO_DECKCRAFT_CLI", legacyCommandEnv: "AIOA_DECKCRAFT_CLI",
    args: ["mcp"], defaultControlPort: 7990, connectArgument: (port: number) => String(port),
  },
] as const;

function findInstalledCli(id: string, label: string): string | undefined {
  if (process.platform !== "win32") return undefined;

  const executable = `${id}-cli.exe`;
  const roots = [
    process.env["ProgramFiles(x86)"],
    process.env.ProgramFiles,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : undefined,
  ];
  for (const root of roots) {
    if (!root) continue;
    const candidate = join(root, label, executable);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function defaultConfigs(): McpServerConfig[] {
  return APP_DEFINITIONS.map(({ id, label, commandEnv, legacyCommandEnv, args, defaultControlPort, connectArgument }) => ({
    id,
    label,
    command: process.env[commandEnv] || process.env[legacyCommandEnv] || findInstalledCli(id, label) || `${id}-cli`,
    args: [...args],
    defaultControlPort,
    connectArgument,
  }));
}

function loadConfigs(): McpServerConfig[] {
  const defaults = defaultConfigs();
  const configuredPath = process.env.BEBO_MCP_CONFIG || process.env.AIOA_MCP_CONFIG;
  const currentPath = resolve(process.cwd(), "bebo.mcp.json");
  const legacyPath = resolve(process.cwd(), "aioa.mcp.json");
  const path = configuredPath || (existsSync(currentPath) ? currentPath : legacyPath);
  if (!existsSync(path)) return defaults;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { servers?: unknown };
    const configuredServers = parsed.servers;
    if (!Array.isArray(configuredServers)) return defaults;
    return defaults.map((base) => {
      const override = configuredServers.find((item: any) => item?.id === base.id) as
        | { command?: unknown; args?: unknown }
        | undefined;
      return {
        ...base,
        command: typeof override?.command === "string" && override.command.trim() ? override.command : base.command,
        args: Array.isArray(override?.args) && override.args.every((arg: unknown) => typeof arg === "string")
          ? override.args as string[]
          : base.args,
      };
    });
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

class McpStdioClient {
  readonly serverId: string;
  private child: ChildProcess | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<string, PendingRequest>();
  private closed = false;
  private started = false;
  private failure: string | undefined;
  private toolList: McpToolInfo[] = [];

  constructor(private config: McpServerConfig) {
    this.serverId = config.id;
  }

  get tools(): McpToolInfo[] {
    return [...this.toolList];
  }

  get connected(): boolean {
    return this.started && !this.closed;
  }

  get error(): string | undefined {
    return this.failure;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const executable = basename(this.config.command).toLowerCase().replace(/\.exe$/, "");
    if (executable !== `${this.config.id}-cli`) {
      throw new Error(`The ${this.config.label} command must point to ${this.config.id}-cli`);
    }
    const child = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "ignore"],
      shell: false,
      windowsHide: true,
    });
    this.child = child;
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => this.onData(chunk));
    child.on("error", (error) => this.fail(error));
    child.on("close", (code, signal) => {
      if (!this.closed) this.fail(new Error(`MCP process exited (${signal ?? code ?? "unknown status"})`));
    });

    try {
      await new Promise<void>((resolveSpawn, rejectSpawn) => {
        child.once("spawn", resolveSpawn);
        child.once("error", rejectSpawn);
      });
      await this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
          clientInfo: { name: "Bebo", version: "0.1.0" },
      }, 30_000);
      this.notify("notifications/initialized");
      const result = await this.request("tools/list", {}, 30_000) as { tools?: unknown };
      this.toolList = Array.isArray(result.tools)
        ? result.tools.filter((tool): tool is McpToolInfo => isToolInfo(tool))
        : [];
      this.started = true;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.started || this.closed) throw new Error(`${this.config.label} is not connected`);
    if (!this.toolList.some((tool) => tool.name === name)) throw new Error(`Unknown ${this.config.label} tool: ${name}`);
    const result = await this.request("tools/call", { name, arguments: args }) as McpToolResult | undefined;
    if (!result) throw new Error(`${this.config.label} returned an empty tool response`);
    const parts = (result.content ?? []).map((item) => {
      if (item.type === "text") return item.text ?? "";
      if (item.type === "image") return `[image result omitted (${item.mimeType ?? "unknown type"})]`;
      return item.text ?? JSON.stringify(item);
    }).filter(Boolean);
    if (result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
    const output = parts.join("\n") || "(no output)";
    if (result.isError) throw new Error(output);
    return output.length > 160_000 ? `${output.slice(0, 160_000)}\n[output truncated]` : output;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectPending(new Error(`${this.config.label} MCP connection closed`));
    this.child?.kill();
    this.child = null;
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (this.closed || !this.child?.stdin) return Promise.reject(new Error(`${this.config.label} MCP process is not running`));
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const key = String(id);
      const timer = setTimeout(() => {
        this.pending.delete(key);
        rejectRequest(new Error(`${this.config.label} did not answer ${method} within ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(key, { resolve: resolveRequest, reject: rejectRequest, timer });
      this.write({ jsonrpc: "2.0", id, method, params }, key);
    });
  }

  private notify(method: string): void {
    this.write({ jsonrpc: "2.0", method });
  }

  private write(message: Record<string, unknown>, id?: string): void {
    try {
      this.child?.stdin?.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) this.rejectRequest(id, error);
      });
    } catch (error) {
      this.rejectRequest(id, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > MAX_FRAME_CHARS && !this.buffer.includes("\n")) {
      this.fail(new Error(`${this.config.label} sent a response larger than 16 MiB`));
      return;
    }
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length > MAX_FRAME_CHARS) {
        this.fail(new Error(`${this.config.label} sent a response larger than 16 MiB`));
        return;
      }
      if (line.trim()) this.onMessage(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private onMessage(line: string): void {
    let message: { id?: unknown; result?: unknown; error?: { message?: string; code?: number } };
    try {
      message = JSON.parse(line);
    } catch {
      this.fail(new Error(`${this.config.label} wrote a non-JSON message to MCP stdout`));
      return;
    }
    if (message.id === undefined || message.id === null) return;
    const key = String(message.id);
    const pending = this.pending.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    if (message.error) {
      pending.reject(new Error(`${this.config.label}: ${message.error.message ?? `MCP error ${message.error.code ?? "unknown"}`}`));
    } else {
      pending.resolve(message.result);
    }
  }

  private rejectRequest(id: string | undefined, error: Error): void {
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.reject(error);
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.failure = error.message;
    this.closed = true;
    this.rejectPending(error);
    this.child?.kill();
  }
}

function isToolInfo(value: unknown): value is McpToolInfo {
  return !!value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string";
}

class McpBridgeManager {
  private connections = new Map<string, McpStdioClient>();
  private connecting = new Map<string, Promise<McpStdioClient>>();
  private lastErrors = new Map<string, string>();
  private activeOptions = new Map<string, McpConnectionOptions>();

  constructor(private configs: McpServerConfig[]) {}

  statuses() {
    return this.configs.map((config) => ({
      id: config.id,
      label: config.label,
      connected: this.connections.get(config.id)?.connected ?? false,
      toolCount: this.connections.get(config.id)?.connected ? this.connections.get(config.id)!.tools.length : 0,
      error: this.lastErrors.get(config.id) ?? this.connections.get(config.id)?.error,
      defaultControlPort: config.defaultControlPort,
      connectionMode: this.activeOptions.get(config.id)?.mode,
      controlPort: this.activeOptions.get(config.id)?.controlPort,
    }));
  }

  async connect(serverId: string, options: McpConnectionOptions) {
    const config = this.configs.find((item) => item.id === serverId);
    if (!config) throw new Error(`Unsupported MCP app: ${serverId}`);
    if (options.mode !== "desktop" && options.mode !== "headless") throw new Error("mode must be desktop or headless");
    let args = config.args;
    let activeOptions: McpConnectionOptions = { mode: options.mode };
    if (options.mode === "desktop") {
      const port = Number(options.controlPort ?? config.defaultControlPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Control port must be a number from 1 to 65535");
      args = ["mcp", "--connect", config.connectArgument(port)];
      activeOptions = { mode: "desktop", controlPort: port };
    }
    const pending = this.connecting.get(serverId);
    if (pending) {
      await pending;
      return this.statuses().find((item) => item.id === serverId)!;
    }
    const existing = this.connections.get(serverId);
    if (existing?.connected) return this.statuses().find((item) => item.id === serverId)!;
    if (existing) this.connections.delete(serverId);

    const connectTask = (async () => {
      const client = new McpStdioClient({ ...config, args });
      this.connections.set(serverId, client);
      try {
        await client.start();
        this.lastErrors.delete(serverId);
        this.activeOptions.set(serverId, activeOptions);
        return client;
      } catch (error) {
        this.connections.delete(serverId);
        this.activeOptions.delete(serverId);
        const message = error instanceof Error ? error.message : String(error);
        this.lastErrors.set(serverId, `${message}. Install the app's CLI or set its command in bebo.mcp.json.`);
        throw new Error(this.lastErrors.get(serverId));
      } finally {
        this.connecting.delete(serverId);
      }
    })();
    this.connecting.set(serverId, connectTask);
    await connectTask;
    return this.statuses().find((item) => item.id === serverId)!;
  }

  disconnect(serverId: string) {
    const client = this.connections.get(serverId);
    client?.close();
    this.connections.delete(serverId);
    this.activeOptions.delete(serverId);
    this.lastErrors.delete(serverId);
    return this.statuses();
  }

  tools() {
    const out: { serverId: string; serverLabel: string; tool: McpToolInfo }[] = [];
    for (const config of this.configs) {
      const client = this.connections.get(config.id);
      if (!client?.connected) continue;
      for (const tool of client.tools) out.push({ serverId: config.id, serverLabel: config.label, tool });
    }
    return out;
  }

  call(serverId: string, name: string, args: Record<string, unknown>) {
    const client = this.connections.get(serverId);
    if (!client?.connected) throw new Error(`${serverId} is not connected`);
    return client.callTool(name, args);
  }

  close() {
    for (const client of this.connections.values()) client.close();
    this.connections.clear();
  }
}

function isLoopbackRequest(req: any): boolean {
  const address = String(req.socket?.remoteAddress ?? "");
  if (address && address !== "::1" && address !== "127.0.0.1" && !address.startsWith("::ffff:127.")) return false;
  const origin = req.headers?.origin;
  if (typeof origin === "string") {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]" && host !== "::1") return false;
    } catch {
      return false;
    }
  }
  return true;
}

function readJsonBody(req: any): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.on("data", (chunk: string | Buffer) => {
      body += chunk.toString();
      if (body.length > 1_000_000) rejectBody(new Error("Request body is too large"));
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object");
        resolveBody(parsed as Record<string, unknown>);
      } catch (error) {
        rejectBody(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", (error: Error) => rejectBody(error));
  });
}

function sendJson(res: any, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

async function handleApi(req: any, res: any, url: URL, bridge: McpBridgeManager): Promise<boolean> {
  if (!url.pathname.startsWith("/api/mcp")) return false;
  if (!isLoopbackRequest(req) || req.headers?.["x-bebo-mcp-request"] !== "1") {
    sendJson(res, 403, { error: "MCP bridge requests must come from the local Bebo page." });
    return true;
  }
  try {
    if (req.method === "GET" && url.pathname === "/api/mcp/servers") {
      sendJson(res, 200, { servers: bridge.statuses() });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/api/mcp/tools") {
      sendJson(res, 200, { tools: bridge.tools() });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/mcp/connect") {
      const body = await readJsonBody(req);
      if (typeof body.serverId !== "string") throw new Error("serverId is required");
      const mode = body.mode === "headless" ? "headless" : "desktop";
      const controlPort = typeof body.controlPort === "number" || typeof body.controlPort === "string"
        ? Number(body.controlPort)
        : undefined;
      sendJson(res, 200, { server: await bridge.connect(body.serverId, { mode, controlPort }) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/mcp/disconnect") {
      const body = await readJsonBody(req);
      if (typeof body.serverId !== "string") throw new Error("serverId is required");
      sendJson(res, 200, { servers: bridge.disconnect(body.serverId) });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/mcp/call") {
      const body = await readJsonBody(req);
      if (typeof body.serverId !== "string" || typeof body.name !== "string") throw new Error("serverId and name are required");
      const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
        ? body.arguments as Record<string, unknown>
        : {};
      sendJson(res, 200, { result: await bridge.call(body.serverId, body.name, args) });
      return true;
    }
    sendJson(res, 404, { error: "Unknown MCP bridge endpoint" });
    return true;
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    return true;
  }
}

export function beboMcpBridge(): Plugin {
  const bridge = new McpBridgeManager(loadConfigs());
  let installed = false;
  const attach = (server: any) => {
    if (installed) return;
    installed = true;
    server.middlewares.use((req: any, res: any, next: () => void) => {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", "http://localhost");
      } catch {
        next();
        return;
      }
      void handleApi(req, res, url, bridge).then((handled) => {
        if (!handled) next();
      }).catch((error) => {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
    });
    server.httpServer?.once("close", () => bridge.close());
  };
  return {
    name: "bebo-local-mcp-bridge",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
