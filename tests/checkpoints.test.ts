import { describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/agent/checkpoints.js";
import { MockHost } from "../src/host/mock.js";

describe("checkpoints", () => {
  it("rolls back cell values after a mutation", async () => {
    const host = new MockHost({ Sheet1: { A1: "keep", B1: 10 } });
    const store = new CheckpointStore(host);
    const cp = await store.create("before test");

    await host.writeRange("Sheet1", "A1:B2", [
      ["changed", 999],
      ["new row", 1],
    ]);
    expect((await host.readRange("Sheet1", "A1:B2")).values).toEqual([
      ["changed", 999],
      ["new row", 1],
    ]);

    await store.rollback(cp.id);
    expect((await host.readRange("Sheet1", "A1:B2")).values).toEqual([
      ["keep", 10],
      [null, null],
    ]);
  });

  it("restores formulas and deleted sheets", async () => {
    const host = new MockHost({ Sheet1: { A1: 5, A2: "=A1*2" } });
    const store = new CheckpointStore(host);
    const cp = await store.create("snap");

    await host.applyStructureOp({ kind: "deleteSheet", name: "Sheet1" });
    await store.rollback(cp.id);

    const overview = await host.getOverview();
    expect(overview.sheets.map((s) => s.name)).toContain("Sheet1");
    const data = await host.readRange("Sheet1", "A2");
    expect(data.formulas[0][0]).toBe("=A1*2");
    expect(data.values[0][0]).toBe(10);
  });

  it("drops later checkpoints after rolling back to an earlier one", async () => {
    const host = new MockHost();
    const store = new CheckpointStore(host);
    const cp1 = await store.create("one");
    await host.writeRange("Sheet1", "A1", [[1]]);
    const cp2 = await store.create("two");
    expect(store.list().map((c) => c.label)).toEqual(["one", "two"]);

    await store.rollback(cp1.id);
    expect(store.list().map((c) => c.label)).toEqual(["one"]);
    await expect(store.rollback(cp2.id)).rejects.toThrow(/not found/);
  });
});

describe("checkpoint rollback fidelity", () => {
  it("restores formatting instead of wiping it", async () => {
    const host = new MockHost({ Sheet1: { A1: "Header", A2: 1 } });
    await host.setFormat("Sheet1", "A1", { bold: true, fillColor: "#FFFF00" });
    const store = new CheckpointStore(host);
    const cp = await store.create("snap");

    await host.setFormat("Sheet1", "A1", { bold: false, fillColor: "#FF0000" });
    await host.setFormat("Sheet1", "C5", { italic: true });
    await host.writeRange("Sheet1", "A2", [[99]]);
    await store.rollback(cp.id);

    const data = await host.readRange("Sheet1", "A1:A2");
    expect(data.formats[0][0]).toEqual({ bold: true, fillColor: "#FFFF00" });
    expect(data.values[1][0]).toBe(1);
    expect((await host.readRange("Sheet1", "C5")).formats[0][0]).toBeNull();
  });

  it("keeps formatting on cells whose content the agent cleared", async () => {
    const host = new MockHost({ Sheet1: { B2: 5 } });
    await host.setFormat("Sheet1", "B2", { numberFormat: "0.00" });
    const store = new CheckpointStore(host);
    const cp = await store.create("snap");

    await host.writeRange("Sheet1", "B2", [[null]]);
    await store.rollback(cp.id);

    const data = await host.readRange("Sheet1", "B2");
    expect(data.values[0][0]).toBe(5);
    expect(data.formats[0][0]).toEqual({ numberFormat: "0.00" });
  });

  it("restores sheet order and removes added sheets and charts", async () => {
    const host = new MockHost({ Sheet1: { A1: 1 }, Data: { A1: 2 } });
    const store = new CheckpointStore(host);
    const cp = await store.create("snap");

    await host.applyStructureOp({ kind: "deleteSheet", name: "Sheet1" });
    await host.applyStructureOp({ kind: "addSheet", name: "Scratch" });
    await host.addChart({ sheet: "Data", dataRange: "A1", type: "line" });
    await store.rollback(cp.id);

    expect((await host.getOverview()).sheets.map((s) => s.name)).toEqual(["Sheet1", "Data"]);
    expect(host.charts).toEqual([]);
    expect((await host.readRange("Sheet1", "A1")).values[0][0]).toBe(1);
  });
});
