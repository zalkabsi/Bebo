import { describe, expect, it } from "vitest";
import { diffSheet, emptySnapshot, stableStringify } from "../src/host/snapshot.js";
import type { SheetSnapshot } from "../src/host/types.js";

function snap(partial: Partial<SheetSnapshot>): SheetSnapshot {
  return { ...emptySnapshot("S", 0), ...partial };
}

describe("diffSheet", () => {
  it("returns nothing when unchanged", () => {
    const s = snap({ inputs: [["a", 1], ["=A2", ""]], formats: [[{ b: 1 }, null], [null, null]] });
    expect(diffSheet(s, structuredClone(s))).toEqual({ contentRuns: [], formatRuns: [] });
  });

  it("groups adjacent changed cells into row runs", () => {
    const target = snap({ inputs: [["a", "b", "c", "d"]], formats: null });
    const current = snap({ inputs: [["x", "y", "c", "z"]], formats: null });
    expect(diffSheet(target, current).contentRuns).toEqual([
      { row: 0, startCol: 0, items: ["a", "b"] },
      { row: 0, startCol: 3, items: ["d"] },
    ]);
  });

  it("clears cells outside the target block, honouring offsets", () => {
    const target = snap({ startRow: 1, startCol: 1, inputs: [[5]], formats: [[null]] });
    const current = snap({ inputs: [["new", ""], ["", 5]], formats: [[{ i: 1 }, null], [null, null]] });
    const diff = diffSheet(target, current);
    expect(diff.contentRuns).toEqual([{ row: 0, startCol: 0, items: [""] }]);
    expect(diff.formatRuns).toEqual([{ row: 0, startCol: 0, items: [null] }]);
  });

  it("splits format runs between restore and clear", () => {
    const target = snap({ inputs: [["", ""]], formats: [[{ b: 1 }, null]] });
    const current = snap({ inputs: [["", ""]], formats: [[{ b: 2 }, { b: 3 }]] });
    expect(diffSheet(target, current).formatRuns).toEqual([
      { row: 0, startCol: 0, items: [{ b: 1 }] },
      { row: 0, startCol: 1, items: [null] },
    ]);
  });

  it("skips format comparison when formats were not captured", () => {
    const target = snap({ inputs: [["a"]], formats: null });
    const current = snap({ inputs: [["a"]], formats: [[{ b: 1 }]] });
    expect(diffSheet(target, current).formatRuns).toEqual([]);
  });

  it("stableStringify ignores key order", () => {
    expect(stableStringify({ a: 1, b: { d: 2, c: 3 } })).toBe(stableStringify({ b: { c: 3, d: 2 }, a: 1 }));
  });
});
