import { describe, expect, it } from "vitest";
import { buildBlueprint, ChangeLog } from "../src/agent/context.js";
import { estimateTokens } from "../src/agent/types.js";
import { MockHost } from "../src/host/mock.js";

function bigHost(): MockHost {
  const seed: Record<string, Record<string, string | number>> = {};
  for (let s = 0; s < 12; s++) {
    const cells: Record<string, string | number> = {};
    for (let c = 0; c < 40; c++) {
      let col = "";
      let n = c + 1;
      while (n > 0) {
        col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
        n = Math.floor((n - 1) / 26);
      }
      cells[`${col}1`] = `header_${s}_${c}_with_a_longish_name`;
      for (let r = 2; r <= 60; r++) cells[`${col}${r}`] = s * 1000 + r * c;
    }
    seed[`DataSheet${s}`] = cells;
  }
  return new MockHost(seed);
}

describe("workbook blueprint", () => {
  it("summarizes sheets, headers, named ranges, and selection", async () => {
    const host = new MockHost({ Sales: { A1: "Region", B1: "Qty", A2: "N", B2: 5 } });
    host.namedRanges = [{ name: "Total", refersTo: "Sales!$B$2" }];
    host.selection = { sheet: "Sales", address: "A2" };
    const log = new ChangeLog();
    log.record("wrote Sales!A2");

    const blueprint = await buildBlueprint(host, log);
    expect(blueprint).toContain("Sales");
    expect(blueprint).toContain("Region | Qty");
    expect(blueprint).toContain("Total = Sales!$B$2");
    expect(blueprint).toContain("Selection: Sales!A2");
    expect(blueprint).toContain("wrote Sales!A2");
    expect(blueprint).not.toContain('"values"');
  });

  it("stays under the token budget on a large workbook", async () => {
    const host = bigHost();
    const maxTokens = 800;
    const blueprint = await buildBlueprint(host, undefined, { maxTokens });
    expect(estimateTokens(blueprint)).toBeLessThanOrEqual(maxTokens);
  });

  it("does not dump full grids", async () => {
    const host = bigHost();
    const blueprint = await buildBlueprint(host, undefined, { maxTokens: 3000 });
    expect(blueprint).not.toContain("59000");
    expect(blueprint.split("\n").length).toBeLessThan(200);
  });
});
