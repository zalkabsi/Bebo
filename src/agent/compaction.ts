import { estimateMessageTokens, type ChatMessage } from "./types.js";

export interface CompactionOptions {
  maxTokens?: number;
  keepRecent?: number;
}

export type SummarizeFn = (transcript: string) => Promise<string>;

function transcriptOf(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === "tool") return `[tool ${m.name}]: ${m.content.slice(0, 500)}`;
      if (m.role === "assistant" && m.toolCalls?.length) {
        const calls = m.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`).join("; ");
        return `[assistant]: ${m.content}\n[calls]: ${calls}`;
      }
      return `[${m.role}]: ${m.content}`;
    })
    .join("\n\n");
}

export function needsCompaction(messages: ChatMessage[], maxTokens: number): boolean {
  return estimateMessageTokens(messages) > maxTokens;
}

export async function compactHistory(
  messages: ChatMessage[],
  summarize: SummarizeFn,
  opts: CompactionOptions = {},
): Promise<ChatMessage[]> {
  const maxTokens = opts.maxTokens ?? 24_000;
  const keepRecent = opts.keepRecent ?? 6;
  if (!needsCompaction(messages, maxTokens)) return messages;

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= keepRecent) return messages;

  const older = rest.slice(0, rest.length - keepRecent);
  const recent = rest.slice(rest.length - keepRecent);
  const summary = await summarize(transcriptOf(older));
  const summaryMessage: ChatMessage = {
    role: "user",
    content: `[Summary of earlier conversation]\n${summary}`,
  };
  return [...system, summaryMessage, ...recent];
}
