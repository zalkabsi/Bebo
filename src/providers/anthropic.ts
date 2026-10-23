import type { ChatMessage } from "../agent/types.js";
import { sseJsonStream } from "./sse.js";
import type { ChatRequest, Provider, ProviderDelta } from "./types.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

function toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: unknown[] } {
  const systemParts: string[] = [];
  const out: unknown[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: m.content }] });
    } else if (m.role === "assistant") {
      const content: unknown[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) {
        content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      }
      out.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      const prev = out[out.length - 1] as { role: string; content: unknown[] } | undefined;
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content, is_error: m.isError === true };
      if (prev?.role === "user" && Array.isArray(prev.content)) {
        prev.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return { system: systemParts.join("\n\n") || undefined, messages: out };
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  label: "Anthropic",
  defaultBaseURL: DEFAULT_BASE_URL,
  defaultModel: "claude-sonnet-4-5",

  async *streamChat(req: ChatRequest): AsyncIterable<ProviderDelta> {
    const base = (req.baseURL || DEFAULT_BASE_URL).replace(/\/$/, "");
    const { system, messages } = toAnthropicMessages(req.messages);
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: 8192,
      messages,
      stream: true,
    };
    if (system) body.system = system;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    }

    const response = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": req.apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal: req.signal ?? null,
    });

    const pending = new Map<number, { id: string; name: string; json: string }>();
    let stopReason: string | undefined;

    for await (const raw of sseJsonStream(response)) {
      const event = raw as {
        type: string;
        index?: number;
        content_block?: { type: string; id?: string; name?: string };
        delta?: { type: string; text?: string; partial_json?: string; stop_reason?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
        message?: { usage?: { input_tokens?: number } };
      };

      if (event.type === "message_start" && event.message?.usage) {
        yield { type: "usage", usage: { inputTokens: event.message.usage.input_tokens } };
      } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        pending.set(event.index ?? 0, { id: event.content_block.id ?? "", name: event.content_block.name ?? "", json: "" });
      } else if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
          const acc = pending.get(event.index ?? 0);
          if (acc) acc.json += event.delta.partial_json;
        }
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage?.output_tokens !== undefined) {
          yield { type: "usage", usage: { outputTokens: event.usage.output_tokens } };
        }
      }
    }

    for (const [, acc] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
      let args: Record<string, unknown> = {};
      try {
        args = acc.json ? JSON.parse(acc.json) : {};
      } catch {
        args = { __raw: acc.json };
      }
      yield { type: "tool_call", toolCall: { id: acc.id || `toolu_${crypto.randomUUID()}`, name: acc.name, arguments: args } };
    }
    yield { type: "done", finishReason: stopReason };
  },
};
