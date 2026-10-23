import { describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/agent/checkpoints.js";
import { MockHost } from "../src/host/mock.js";
import type { ToolContext } from "../src/tools/registry.js";
import { writeCells } from "../src/tools/excel/write_cells.js";

function ctxFor(host: MockHost): ToolContext {
  return { host, checkpoints: new CheckpointStore(host), ask: async () => "" };
}

describe("write_cells", () => {
  it("writes into empty cells and verifies", async () => {
    const host = new MockHost();
    const result = await writeCells.handler(
      { sheet: "Sheet1", address: "B2:C3", values: [[1, 2], [3, 4]] },
      ctxFor(host),
    );
    expect(result).toContain("verified");
    expect((await host.readRange("Sheet1", "B2:C3")).values).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("refuses to overwrite non-empty cells without overwrite=true", async () => {
    const host = new MockHost({ Sheet1: { A1: "precious" } });
    await expect(
      writeCells.handler({ sheet: "Sheet1", address: "A1:B1", values: [["x", "y"]] }, ctxFor(host)),
    ).rejects.toThrow(/Refusing to overwrite/);
    expect((await host.readRange("Sheet1", "A1")).values[0][0]).toBe("precious");
  });

  it("overwrites when overwrite=true", async () => {
    const host = new MockHost({ Sheet1: { A1: "old" } });
    await writeCells.handler(
      { sheet: "Sheet1", address: "A1", values: [["new"]], overwrite: true },
      ctxFor(host),
    );
    expect((await host.readRange("Sheet1", "A1")).values[0][0]).toBe("new");
  });

  it("rejects dimension mismatches", async () => {
    const host = new MockHost();
    await expect(
      writeCells.handler({ sheet: "Sheet1", address: "A1:B2", values: [[1]] }, ctxFor(host)),
    ).rejects.toThrow(/do not match/);
  });

  it("treats '=...' strings as formulas and verifies them", async () => {
    const host = new MockHost({ Sheet1: { A1: 2, A2: 3 } });
    await writeCells.handler(
      { sheet: "Sheet1", address: "A3", values: [["=A1+A2"]] },
      ctxFor(host),
    );
    const data = await host.readRange("Sheet1", "A3");
    expect(data.formulas[0][0]).toBe("=A1+A2");
    expect(data.values[0][0]).toBe(5);
  });
});
