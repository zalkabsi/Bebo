import type { ConnectedMcpTool } from "./mcpClient.js";
import { callMcpTool } from "./mcpClient.js";
import type { ToolDefinition } from "../tools/registry.js";

const READ_ONLY_TOOLS: Record<string, ReadonlySet<string>> = {
  wordcraft: new Set(["list_commands", "inspect_document", "get_text", "render_page", "parity"]),
  gridcraft: new Set(["list_commands", "inspect_workbook", "read_range", "get_cell", "evaluate_formula", "list_functions"]),
  deckcraft: new Set(["list_commands", "inspect_document", "inspect_slide", "render_slide"]),
};

function stableSuffix(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function modelToolName(serverId: string, originalName: string): string {
  const prefix = `mcp_${serverId}_`;
  const slug = originalName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
  return `${prefix}${slug}_${stableSuffix(originalName)}`;
}

function inputSchema(tool: ConnectedMcpTool["tool"]): Record<string, unknown> {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object" || schema.type !== "object") {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  return schema;
}

export function createMcpToolDefinitions(tools: ConnectedMcpTool[]): ToolDefinition[] {
  return tools.map(({ serverId, serverLabel, tool }) => {
    // MCP annotations are advisory. Only these documented inspectors are treated as reads;
    // every other operation requires a fresh user confirmation.
    const readOnly = READ_ONLY_TOOLS[serverId]?.has(tool.name) === true;
    return {
      name: modelToolName(serverId, tool.name),
      description: `[${serverLabel} MCP tool: ${tool.name}] ${tool.description ?? "Call this tool in the connected app."}`,
      // Unknown and mutating tools require confirmation every time.
      level: readOnly ? "read" : "structure",
      autoCheckpoint: false,
      parameters: inputSchema(tool),
      async handler(args) {
        return callMcpTool(serverId, tool.name, args);
      },
    };
  });
}
