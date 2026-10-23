// exec_js sandbox entry. Runs in a dedicated worker: no DOM, no localStorage (API keys), no
// access to the task pane's globals. Everything it needs is captured before lockdown.
import type { ToSandbox } from "./protocol.js";
import { createSandboxRuntime, lockdown } from "./runtime.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scope = self as any;
const post = scope.postMessage.bind(scope);
const compile = Function;

let handle: (msg: ToSandbox) => void;
try {
  const runtime = createSandboxRuntime(post, (...params) => compile(...params) as (...args: unknown[]) => unknown);
  lockdown(scope);
  handle = runtime.handle;
} catch (err) {
  const error = `exec_js sandbox unavailable: ${err instanceof Error ? err.message : String(err)}`;
  handle = () => post({ type: "fatal", error });
}

scope.onmessage = (e: MessageEvent<ToSandbox>) => handle(e.data);
