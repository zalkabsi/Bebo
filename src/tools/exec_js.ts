import type { CellValue } from "../host/types.js";
import type { ToolContext, ToolDefinition } from "./registry.js";
import {
  assertSafeSource,
  isWorkbookMethod,
  type FromSandbox,
  type ToSandbox,
  type WorkbookMethod,
} from "./sandbox/protocol.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/** One isolated execution context for a single exec_js call. */
export interface SandboxPort {
  postMessage(msg: ToSandbox): void;
  onMessage(handler: (msg: FromSandbox) => void): void;
  onError(handler: (message: string) => void): void;
  terminate(): void;
}

export type SandboxFactory = () => SandboxPort;

function workerSandbox(): SandboxPort {
  if (typeof Worker === "undefined") throw new Error("exec_js needs Web Worker support, which this client lacks");
  const worker = new Worker(new URL("./sandbox/worker.ts", import.meta.url), { type: "module" });
  return {
    postMessage: (msg) => worker.postMessage(msg),
    onMessage: (handler) => {
      worker.onmessage = (e: MessageEvent<FromSandbox>) => handler(e.data);
    },
    onError: (handler) => {
      worker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        handler(e.message || "sandbox worker failed to start");
      };
    },
    terminate: () => worker.terminate(),
  };
}

let sandboxFactory: SandboxFactory = workerSandbox;

/** Swaps how sandboxes are created (tests run without Web Workers). */
export function setSandboxFactory(factory: SandboxFactory): void {
  sandboxFactory = factory;
}

function buildWorkbookApi(ctx: ToolContext): Record<WorkbookMethod, (...args: any[]) => Promise<unknown>> {
  const host = ctx.host;
  return {
    overview: () => host.getOverview(),
    read: async (sheet: string, address: string) => (await host.readRange(sheet, address)).values,
    readDetailed: (sheet: string, address: string) => host.readRange(sheet, address),
    write: async (sheet: string, address: string, values: CellValue[][]) => {
      await host.writeRange(sheet, address, values);
      ctx.recordChange?.(`exec_js wrote ${sheet}!${address}`);
    },
    setFormula: async (sheet: string, address: string, formula: string) => {
      await host.setFormula(sheet, address, formula);
      ctx.recordChange?.(`exec_js set formula in ${sheet}!${address}`);
    },
    format: async (sheet: string, address: string, format: Record<string, unknown>) => {
      await host.setFormat(sheet, address, format);
      ctx.recordChange?.(`exec_js formatted ${sheet}!${address}`);
    },
    search: (query: string) => host.search(query),
    listFormulas: () => host.listFormulas(),
  };
}

export const execJs: ToolDefinition = {
  name: "exec_js",
  description: `Execute JavaScript in an isolated sandbox with an async \`workbook\` API for multi-step programmatic work. Available:
- await workbook.overview()
- await workbook.read(sheet, address) → 2D values array
- await workbook.readDetailed(sheet, address) → values + formulas + formats
- await workbook.write(sheet, address, values2D)
- await workbook.setFormula(sheet, address, formula)
- await workbook.format(sheet, address, {bold, fillColor, numberFormat, ...})
- await workbook.search(query)
- await workbook.listFormulas()
console.log output and the last expression's return value are captured. Prefer this tool when a task needs many small operations. No network, DOM, eval, or import.`,
  level: "mutate",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "JS source. Use top-level return for a result value." },
      timeoutMs: { type: "number", description: `Max run time in ms (default ${DEFAULT_TIMEOUT_MS})` },
    },
    required: ["code"],
  },
  async handler(args, ctx) {
    const code = String(args.code);
    const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || DEFAULT_TIMEOUT_MS, 100), 60_000);
    assertSafeSource(code);

    const api = buildWorkbookApi(ctx);
    const sandbox = sandboxFactory();

    return new Promise<string>((resolve, reject) => {
      let finished = false;
      const finish = () => {
        finished = true;
        clearTimeout(timer);
        sandbox.terminate();
      };
      // terminate() really stops the code, so an infinite loop cannot hang Excel.
      const timer = setTimeout(() => {
        finish();
        reject(new Error(`exec_js timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      sandbox.onError((message) => {
        if (finished) return;
        finish();
        reject(new Error(`exec_js sandbox error: ${message}`));
      });

      sandbox.onMessage(async (msg) => {
        if (finished) return;
        if (msg.type === "rpc") {
          let reply: ToSandbox;
          try {
            if (!isWorkbookMethod(msg.method)) throw new Error(`Unknown workbook method: ${String(msg.method)}`);
            const value = await api[msg.method](...(Array.isArray(msg.args) ? msg.args : []));
            reply = { type: "rpc_result", id: msg.id, ok: true, value };
          } catch (err) {
            reply = { type: "rpc_result", id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) };
          }
          if (!finished) sandbox.postMessage(reply);
        } else if (msg.type === "done") {
          finish();
          if (!msg.ok) {
            reject(new Error(msg.error));
            return;
          }
          const out: string[] = [];
          if (msg.logs.length) out.push(msg.logs.join("\n"));
          if (msg.result !== undefined) out.push(`=> ${msg.result}`);
          resolve(out.join("\n") || "(no output)");
        } else if (msg.type === "fatal") {
          finish();
          reject(new Error(msg.error));
        }
      });

      sandbox.postMessage({ type: "run", code });
    });
  },
};
