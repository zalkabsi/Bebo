import { describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/agent/checkpoints.js";
import { MockHost } from "../src/host/mock.js";
import { createCommunityActionBoard } from "../src/tools/community/action_board.js";

describe("community action board", () => {
  it("creates a blank tracker with privacy-conscious headers", async () => {
    const host = new MockHost();
    const result = await createCommunityActionBoard.handler({}, {
      host,
      checkpoints: new CheckpointStore(host),
      ask: async () => "",
    });

    expect(result).toContain('"Community Action Plan"');
    const overview = await host.getOverview();
    expect(overview.sheets.map((sheet) => sheet.name)).toContain("Community Action Plan");

    const title = await host.readRange("Community Action Plan", "A1:G1");
    expect(title.values[0][0]).toBe("Community Action Plan");
    const headers = await host.readRange("Community Action Plan", "A4:G4");
    expect(headers.values[0]).toEqual([
      "Action",
      "Volunteer role (not name)",
      "Status",
      "Target date",
      "Public evidence / source",
      "Impact measure",
      "Progress update (no personal data)",
    ]);
    expect(headers.formats[0][0]?.bold).toBe(true);
  });

  it("uses a new sheet name and leaves an existing tracker untouched", async () => {
    const host = new MockHost({ "Community Action Plan": { A1: "existing user content" } });
    const result = await createCommunityActionBoard.handler({}, {
      host,
      checkpoints: new CheckpointStore(host),
      ask: async () => "",
    });

    expect(result).toContain('"Community Action Plan 2"');
    const existing = await host.readRange("Community Action Plan", "A1");
    expect(existing.values[0][0]).toBe("existing user content");
    const created = await host.readRange("Community Action Plan 2", "A4:G4");
    expect(created.values[0][0]).toBe("Action");
  });
});
