export type ToolLevel = "read" | "mutate" | "structure";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError?: boolean };

export interface PermissionRequestInfo {
  toolName: string;
  level: ToolLevel;
  arguments: Record<string, unknown>;
  alwaysConfirm?: boolean;
}

export interface CheckpointInfo {
  id: string;
  label: string;
  createdAt: number;
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; call: ToolCall }
  | { type: "tool_call_end"; call: ToolCall; result: string; isError: boolean }
  | { type: "permission_request"; request: PermissionRequestInfo }
  | { type: "checkpoint"; checkpoint: CheckpointInfo }
  | { type: "ask_user"; question: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; reason: "stop" | "max_turns" | "aborted" }
  | { type: "error"; error: string };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content ?? "");
    if (m.role === "assistant" && m.toolCalls) {
      total += m.toolCalls.reduce((n, c) => n + estimateTokens(JSON.stringify(c.arguments)) + 4, 0);
    }
  }
  return total;
}
