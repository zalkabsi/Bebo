import type { ChatMessage } from "../agent/types.js";
import { sseJsonStream } from "./sse.js";
import type { ChatRequest, Provider, ProviderDelta } from "./types.js";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function toGeminiContents(messages: ChatMessage[]): { system?: string; contents: unknown[] } {
  const systemParts: string[] = [];
  const contents: unknown[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: c.name, args: c.arguments } });
      }
      contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      const part = {
        functionResponse: {
          name: m.name,
          response: { result: m.content, isError: m.isError === true },
        },
      };
      const prev = contents[contents.length - 1] as { role: string; parts: unknown[] } | undefined;
      if (prev?.role === "user" && Array.isArray(prev.parts)) {
        prev.parts.push(part);
      } else {
        contents.push({ role: "user", parts: [part] });
      }
    }
  }
  return { system: systemParts.join("\n\n") || undefined, contents };
}

export const geminiProvider: Provider = {
  id: "gemini",
  label: "Google Gemini",
  defaultBaseURL: DEFAULT_BASE_URL,
  defaultModel: "gemini-2.5-flash",

  async *streamChat(req: ChatRequest): AsyncIterable<ProviderDelta> {
    const base = (req.baseURL || DEFAULT_BASE_URL).replace(/\/$/, "");
    const { system, contents } = toGeminiContents(req.messages);
    const body: Record<string, unknown> = { contents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (req.tools?.length) {
      body.tools = [{
        functionDeclarations: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const url = `${base}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal ?? null,
    });

    const calls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];
    let finishReason: string | undefined;
    let seq = 0;

    for await (const raw of sseJsonStream(response)) {
      const chunk = raw as {
        candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      if (chunk.usageMetadata) {
        yield {
          type: "usage",
          usage: { inputTokens: chunk.usageMetadata.promptTokenCount, outputTokens: chunk.usageMetadata.candidatesTokenCount },
        };
      }
      const candidate = chunk.candidates?.[0];
      if (!candidate) continue;
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) yield { type: "text", text: part.text };
        if (part.functionCall) {
          calls.push({
            id: `gemini_call_${seq++}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          });
        }
      }
      if (candidate.finishReason) finishReason = candidate.finishReason;
    }

    for (const toolCall of calls) yield { type: "tool_call", toolCall };
    yield { type: "done", finishReason };
  },
};
