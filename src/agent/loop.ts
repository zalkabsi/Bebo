import type { Provider } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import { CheckpointStore } from "./checkpoints.js";
import { PermissionDeniedError, PermissionEngine } from "./permissions.js";
import type { AgentEvent, ChatMessage, ToolCall } from "./types.js";

export interface AgentLoopOptions {
  provider: Provider;
  model: string;
  apiKey: string;
  baseURL?: string;
  tools: ToolRegistry;
  permissions: PermissionEngine;
  checkpoints: CheckpointStore;
  host: import("../host/types.js").WorkbookHost;
  askUser: (question: string) => Promise<string>;
  onEvent: (event: AgentEvent) => void;
  maxTurns?: number;
  signal?: AbortSignal;
  recordChange?: (entry: string) => void;
}

export class AgentAbortedError extends Error {
  constructor() {
    super("Agent run aborted");
    this.name = "AgentAbortedError";
  }
}

const DEFAULT_MAX_TURNS = 25;

export async function runAgentLoop(messages: ChatMessage[], opts: AgentLoopOptions): Promise<ChatMessage[]> {
  const history = [...messages];
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const emit = opts.onEvent;

  const throwIfAborted = () => {
    if (opts.signal?.aborted) throw new AgentAbortedError();
  };

  let turn = 0;
  // One checkpoint per user request (before its first mutation): rollback undoes the whole
  // request, and large workbooks are not re-snapshotted on every model turn.
  let checkpointed = false;
  try {
    while (turn < maxTurns) {
      throwIfAborted();
      let text = "";
      const toolCalls: ToolCall[] = [];

      for await (const delta of opts.provider.streamChat({
        messages: history,
        tools: opts.tools.specs(),
        model: opts.model,
        apiKey: opts.apiKey,
        baseURL: opts.baseURL,
        signal: opts.signal,
      })) {
        throwIfAborted();
        if (delta.type === "text") {
          text += delta.text;
          emit({ type: "text_delta", text: delta.text });
        } else if (delta.type === "tool_call") {
          toolCalls.push(delta.toolCall);
        } else if (delta.type === "usage") {
          emit({ type: "usage", usage: delta.usage });
        }
      }

      history.push({ role: "assistant", content: text, toolCalls: toolCalls.length ? toolCalls : undefined });

      if (toolCalls.length === 0) {
        emit({ type: "done", reason: "stop" });
        return history;
      }

      for (const call of toolCalls) {
        throwIfAborted();
        const tool = opts.tools.get(call.name);
        emit({ type: "tool_call_start", call });

        let result: string;
        let isError = false;

        if (!tool) {
          result = `Unknown tool: ${call.name}`;
          isError = true;
        } else {
          try {
            await opts.permissions.authorize(tool.name, tool.level, call.arguments);

            if ((tool.level === "mutate" || tool.level === "structure") && tool.autoCheckpoint !== false && !checkpointed) {
              const cp = await opts.checkpoints.create(`before ${call.name}`);
              checkpointed = true;
              emit({ type: "checkpoint", checkpoint: cp });
            }

            result = await tool.handler(call.arguments, {
              host: opts.host,
              checkpoints: opts.checkpoints,
              ask: async (question: string) => {
                emit({ type: "ask_user", question });
                return opts.askUser(question);
              },
              recordChange: opts.recordChange,
            });
          } catch (err) {
            if (err instanceof AgentAbortedError) throw err;
            isError = true;
            result = err instanceof PermissionDeniedError
              ? err.message
              : `Tool error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        emit({ type: "tool_call_end", call, result, isError });
        history.push({ role: "tool", toolCallId: call.id, name: call.name, content: result, isError });
      }

      turn++;
    }
    emit({ type: "done", reason: "max_turns" });
    return history;
  } catch (err) {
    if (err instanceof AgentAbortedError) {
      emit({ type: "done", reason: "aborted" });
      return history;
    }
    emit({ type: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
