import type { McpToolInfo } from "./mcpBridge.js";

export interface McpServerStatus {
  id: string;
  label: string;
  connected: boolean;
  toolCount: number;
  error?: string;
  busy?: boolean;
  defaultControlPort: number;
  connectionMode?: McpConnectionMode;
  controlPort?: number;
}

export type McpConnectionMode = "desktop" | "headless";

export interface McpConnectionPreference {
  mode: McpConnectionMode;
  controlPort: number;
}

export type McpConnectionPreferences = Record<string, McpConnectionPreference>;

const MCP_CONNECTION_PREFERENCES_KEY = "bebo.mcpConnectionPreferences.v1";

export function loadMcpConnectionPreferences(): McpConnectionPreferences {
  try {
    const raw = localStorage.getItem(MCP_CONNECTION_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const preferences: McpConnectionPreferences = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const preference = value as Partial<McpConnectionPreference>;
      const port = Number(preference.controlPort);
      if ((preference.mode === "desktop" || preference.mode === "headless") && Number.isInteger(port) && port >= 1 && port <= 65535) {
        preferences[id] = { mode: preference.mode, controlPort: port };
      }
    }
    return preferences;
  } catch {
    return {};
  }
}

export function saveMcpConnectionPreferences(preferences: McpConnectionPreferences): void {
  try {
    localStorage.setItem(MCP_CONNECTION_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // The connection still works if browser storage is unavailable or full.
  }
}

export interface ConnectedMcpTool {
  serverId: string;
  serverLabel: string;
  tool: McpToolInfo;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "x-bebo-mcp-request": "1",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `MCP bridge returned HTTP ${response.status}`);
  return body;
}

function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getMcpServers(): Promise<McpServerStatus[]> {
  const result = await request<{ servers: McpServerStatus[] }>("/api/mcp/servers");
  return result.servers;
}

export async function getConnectedMcpTools(): Promise<ConnectedMcpTool[]> {
  const result = await request<{ tools: ConnectedMcpTool[] }>("/api/mcp/tools");
  return result.tools;
}

export async function connectMcpServer(serverId: string, preference: McpConnectionPreference): Promise<McpServerStatus> {
  const result = await post<{ server: McpServerStatus }>("/api/mcp/connect", {
    serverId,
    mode: preference.mode,
    controlPort: preference.controlPort,
  });
  return result.server;
}

export async function disconnectMcpServer(serverId: string): Promise<McpServerStatus[]> {
  const result = await post<{ servers: McpServerStatus[] }>("/api/mcp/disconnect", { serverId });
  return result.servers;
}

export async function callMcpTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await post<{ result: string }>("/api/mcp/call", { serverId, name, arguments: args });
  return result.result;
}
