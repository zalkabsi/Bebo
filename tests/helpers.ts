import type { ToolCall } from "../src/agent/types.js";
import type { ChatRequest, Provider, ProviderDelta } from "../src/providers/types.js";
import type { SandboxPort } from "../src/tools/exec_js.js";
import type { FromSandbox } from "../src/tools/sandbox/protocol.js";
import { createSandboxRuntime } from "../src/tools/sandbox/runtime.js";

export interface ScriptStep {
  text?: string;
  toolCalls?: ToolCall[];
}

export class FakeProvider implements Provider {
  id = "fake";
  label = "Fake";
  defaultModel = "fake-model";
  scripts: ScriptStep[] = [];
  requests: ChatRequest[] = [];

  streamChat(req: ChatRequest): AsyncIterable<ProviderDelta> {
    this.requests.push(req);
    const script = this.scripts.shift() ?? { text: "(end of script)" };
    return (async function* (): AsyncIterable<ProviderDelta> {
      if (script.text) yield { type: "text", text: script.text };
      for (const toolCall of script.toolCalls ?? []) yield { type: "tool_call", toolCall };
      yield { type: "done", finishReason: script.toolCalls?.length ? "tool_calls" : "stop" };
    })();
  }
}

let callSeq = 0;
export function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: `call_${callSeq++}`, name, arguments: args };
}

/**
 * Runs the real sandbox runtime in-process (Node has no Web Workers). Messages are
 * structured-cloned and delivered asynchronously, like postMessage. No lockdown here:
 * that is exercised separately inside a vm context.
 */
export function inProcessSandbox(): SandboxPort {
  let toMain: ((msg: FromSandbox) => void) | null = null;
  let terminated = false;
  const runtime = createSandboxRuntime(
    (msg) => {
      const copy = structuredClone(msg);
      queueMicrotask(() => {
        if (!terminated) toMain?.(copy);
      });
    },
    (...params) => Function(...params) as (...args: unknown[]) => unknown,
  );
  return {
    postMessage: (msg) => {
      const copy = structuredClone(msg);
      queueMicrotask(() => {
        if (!terminated) runtime.handle(copy);
      });
    },
    onMessage: (handler) => {
      toMain = handler;
    },
    onError: () => {},
    terminate: () => {
      terminated = true;
    },
  };
}
