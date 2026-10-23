/** Workbook API methods the sandbox may call; the main thread rejects anything else. */
export const WORKBOOK_METHODS = [
  "overview",
  "read",
  "readDetailed",
  "write",
  "setFormula",
  "format",
  "search",
  "listFormulas",
] as const;

export type WorkbookMethod = (typeof WORKBOOK_METHODS)[number];

export function isWorkbookMethod(name: unknown): name is WorkbookMethod {
  return typeof name === "string" && (WORKBOOK_METHODS as readonly string[]).includes(name);
}

/** Main thread → sandbox. */
export type ToSandbox =
  | { type: "run"; code: string }
  | { type: "rpc_result"; id: number; ok: true; value: unknown }
  | { type: "rpc_result"; id: number; ok: false; error: string };

/** Sandbox → main thread. */
export type FromSandbox =
  | { type: "rpc"; id: number; method: string; args: unknown[] }
  | { type: "done"; ok: true; logs: string[]; result?: string }
  | { type: "done"; ok: false; logs: string[]; error: string }
  | { type: "fatal"; error: string };

/**
 * Dynamic import() is syntax, so no global can be deleted to disable it, and it can reach any
 * URL. With eval, Function and string timers removed inside the sandbox, rejecting the token
 * in the source is sufficient.
 */
export function assertSafeSource(code: string): void {
  if (/\bimport\b/.test(code)) {
    throw new Error("exec_js code may not use `import` (no modules or network access in the sandbox)");
  }
}
