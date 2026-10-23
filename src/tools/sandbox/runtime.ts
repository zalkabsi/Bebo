import { assertSafeSource, WORKBOOK_METHODS, type FromSandbox, type ToSandbox } from "./protocol.js";

/**
 * Removes every way for sandboxed code to reach the network, other contexts, or dynamic code
 * evaluation, then verifies the result (fails closed). Must be self-contained: tests run it
 * inside a fresh `vm` context via Function.prototype.toString.
 */
export function lockdown(g: any): void {
  const blocked = [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "WebSocketStream",
    "EventSource",
    "WebTransport",
    "importScripts",
    "Worker",
    "SharedWorker",
    "BroadcastChannel",
    "indexedDB",
    "caches",
    "postMessage",
    "eval",
    "Function",
  ];

  const functionProtos = [
    Object.getPrototypeOf(function () {}),
    Object.getPrototypeOf(async function () {}),
    Object.getPrototypeOf(function* () {}),
    Object.getPrototypeOf(async function* () {}),
  ];
  // `(() => {}).constructor` is Function: without this, deleting the global is meaningless.
  for (const proto of functionProtos) {
    Object.defineProperty(proto, "constructor", { value: undefined, writable: false, configurable: false });
  }

  // Web APIs live on the global's prototype chain, not on the global itself.
  for (const name of blocked) {
    for (let o = g; o; o = Object.getPrototypeOf(o)) {
      const d = Object.getOwnPropertyDescriptor(o, name);
      if (!d) continue;
      if (d.configurable) delete o[name];
      else if (d.writable) o[name] = undefined;
    }
  }

  // setTimeout("code") is eval in disguise.
  for (const name of ["setTimeout", "setInterval"]) {
    const original = g[name];
    if (typeof original !== "function") continue;
    g[name] = function (callback: unknown, ...rest: unknown[]) {
      if (typeof callback !== "function") throw new TypeError(`${name} requires a function`);
      return original.call(g, callback, ...rest);
    };
  }

  for (const name of blocked) {
    if (typeof g[name] !== "undefined") throw new Error(`sandbox lockdown could not remove ${name}`);
  }
  for (const proto of functionProtos) {
    if (proto.constructor !== undefined) throw new Error("sandbox lockdown could not neutralize constructors");
  }
}

type Compile = (...params: string[]) => (...args: unknown[]) => unknown;

/**
 * The sandbox side of exec_js: compiles and runs user code with a `workbook` proxy whose
 * every call is an RPC to the main thread (the only place Office.js can run).
 */
export function createSandboxRuntime(post: (msg: FromSandbox) => void, compile: Compile) {
  let seq = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const rpc = (method: string, args: unknown[]) =>
    new Promise<unknown>((resolve, reject) => {
      const id = seq++;
      pending.set(id, { resolve, reject });
      try {
        post({ type: "rpc", id, method, args });
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

  const workbook = Object.freeze(
    Object.fromEntries(WORKBOOK_METHODS.map((m) => [m, (...args: unknown[]) => rpc(m, args)])),
  );

  async function run(code: string): Promise<void> {
    const logs: string[] = [];
    const line = (prefix: string, xs: unknown[]) => logs.push(prefix + xs.map(stringify).join(" "));
    const sandboxConsole = Object.freeze({
      log: (...xs: unknown[]) => line("", xs),
      info: (...xs: unknown[]) => line("", xs),
      warn: (...xs: unknown[]) => line("[warn] ", xs),
      error: (...xs: unknown[]) => line("[error] ", xs),
    });
    try {
      assertSafeSource(code);
      const fn = compile("workbook", "console", `"use strict";\nreturn (async () => {\n${code}\n})();`);
      const result = await fn(workbook, sandboxConsole);
      post({ type: "done", ok: true, logs, result: result === undefined ? undefined : stringify(result) });
    } catch (err) {
      post({ type: "done", ok: false, logs, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    handle(msg: ToSandbox): void {
      if (msg.type === "run") {
        void run(msg.code);
      } else if (msg.type === "rpc_result") {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.value);
        else p.reject(new Error(msg.error));
      }
    },
  };
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
