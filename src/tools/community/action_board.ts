import type { ToolDefinition } from "../registry.js";

const BASE_SHEET_NAME = "Community Action Plan";

function nextSheetName(existingNames: string[]): string {
  const names = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  if (!names.has(BASE_SHEET_NAME.toLocaleLowerCase())) return BASE_SHEET_NAME;

  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${BASE_SHEET_NAME} ${suffix}`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new Error("Could not find an unused sheet name for the community action plan.");
}

export const createCommunityActionBoard: ToolDefinition = {
  name: "create_community_action_board",
  description:
    "Create a new, blank community project tracker in the workbook. It uses volunteer roles instead of names and has columns for public evidence, impact measures, and progress. Never add invented examples or personal data. Creates a separate sheet and never overwrites existing content.",
  level: "structure",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async handler(_args, ctx) {
    const overview = await ctx.host.getOverview();
    const sheetName = nextSheetName(overview.sheets.map((sheet) => sheet.name));

    await ctx.host.applyStructureOp({ kind: "addSheet", name: sheetName });
    await ctx.host.writeRange(sheetName, "A1:G4", [
      ["Community Action Plan", "", "", "", "", "", ""],
      ["Use group-level facts and public sources. Do not enter names, exact addresses, or private contact details.", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["Action", "Volunteer role (not name)", "Status", "Target date", "Public evidence / source", "Impact measure", "Progress update (no personal data)"],
    ]);
    await ctx.host.setFormat(sheetName, "A1:G1", { bold: true, fontSize: 16, fillColor: "#E8F3F1" });
    await ctx.host.setFormat(sheetName, "A4:G4", {
      bold: true,
      fontColor: "#FFFFFF",
      fillColor: "#1F6F68",
      horizontalAlign: "center",
    });

    ctx.recordChange?.(`created blank community action board on ${sheetName}`);
    return `Created a blank community action board on the new sheet "${sheetName}". No example people or community facts were added.`;
  },
};
