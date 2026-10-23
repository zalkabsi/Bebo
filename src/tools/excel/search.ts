import type { ToolDefinition } from "../registry.js";

export const searchWorkbook: ToolDefinition = {
  name: "search_workbook",
  description: "Search all sheets for cells whose value (and optionally formula) contains the query text.",
  level: "read",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      matchCase: { type: "boolean" },
      formulasToo: { type: "boolean", description: "Also search inside formulas" },
    },
    required: ["query"],
  },
  async handler(args, ctx) {
    const matches = await ctx.host.search(String(args.query), {
      matchCase: args.matchCase === true,
      formulasToo: args.formulasToo === true,
    });
    if (matches.length === 0) return "No matches.";
    const lines = matches.slice(0, 50).map((m) => {
      const val = m.value === null ? "" : String(m.value);
      return `${m.sheet}!${m.address}: ${val}${m.formula ? ` [${m.formula}]` : ""}`;
    });
    if (matches.length > 50) lines.push(`… and ${matches.length - 50} more`);
    return lines.join("\n");
  },
};
