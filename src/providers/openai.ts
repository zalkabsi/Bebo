import type { ChatMessage } from "../agent/types.js";
import { sseJsonStream } from "./sse.js";
import type { ChatRequest, Provider, ProviderDelta, ToolSpec } from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OaiToolCallAcc {
  id: string;
  name: string;
  arguments: string;
}

function toOaiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export function createOpenAiCompatibleProvider(opts: {
  id: string;
  label: string;
  defaultBaseURL: string;
  defaultModel: string;
}): Provider {
  return {
    id: opts.id,
    label: opts.label,
    defaultBaseURL: opts.defaultBaseURL,
    defaultModel: opts.defaultModel,

    async *streamChat(req: ChatRequest): AsyncIterable<ProviderDelta> {
      const base = (req.baseURL || opts.defaultBaseURL || DEFAULT_BASE_URL).replace(/\/$/, "");
      const body: Record<string, unknown> = {
        model: req.model,
        messages: toOaiMessages(req.messages),
        stream: true,
      };
      if (req.tools?.length) {
        body.tools = req.tools.map((t: ToolSpec) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }

      const headers: Record<string, string> = { "content-type": "application/json" };
      if (req.apiKey) headers.authorization = `Bearer ${req.apiKey}`;
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: req.signal ?? null,
      });

      const pending = new Map<number, OaiToolCallAcc>();
      let finishReason: string | undefined;

      for await (const raw of sseJsonStream(response)) {
        const chunk = raw as {
          choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        if (chunk.usage) {
          yield { type: "usage", usage: { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens } };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) yield { type: "text", text: delta.content };
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            let acc = pending.get(tc.index);
            if (!acc) {
              acc = { id: "", name: "", arguments: "" };
              pending.set(tc.index, acc);
            }
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      for (const [, acc] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
        let args: Record<string, unknown> = {};
        try {
          args = acc.arguments ? JSON.parse(acc.arguments) : {};
        } catch {
          args = { __raw: acc.arguments };
        }
        yield { type: "tool_call", toolCall: { id: acc.id || `call_${crypto.randomUUID()}`, name: acc.name, arguments: args } };
      }
      yield { type: "done", finishReason };
    },
  };
}

export const openaiProvider = createOpenAiCompatibleProvider({
  id: "openai",
  label: "OpenAI",
  defaultBaseURL: DEFAULT_BASE_URL,
  defaultModel: "gpt-4o",
});
