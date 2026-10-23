import type { CheckpointStore } from "../agent/checkpoints.js";
import type { ToolLevel } from "../agent/types.js";
import type { WorkbookHost } from "../host/types.js";

export interface ToolContext {
  host: WorkbookHost;
  checkpoints: CheckpointStore;
  ask: (question: string) => Promise<string>;
  recordChange?: (entry: string) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  level: ToolLevel;
  parameters: Record<string, unknown>;
  /** Set false for tools whose host provides its own undo or recovery history. */
  autoCheckpoint?: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const t of tools) this.register(t);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  specs(): { name: string; description: string; parameters: Record<string, unknown> }[] {
    return this.definitions().map(({ name, description, parameters }) => ({ name, description, parameters }));
  }
}
