import type { ChatMessage, TokenUsage, ToolCall } from "../agent/types.js";

export type ProviderDelta =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; finishReason?: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  model: string;
  apiKey: string;
  baseURL?: string;
  signal?: AbortSignal;
}

export interface Provider {
  id: string;
  label: string;
  defaultBaseURL?: string;
  defaultModel: string;
  streamChat(req: ChatRequest): AsyncIterable<ProviderDelta>;
}
