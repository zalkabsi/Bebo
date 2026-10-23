import type { ToolDefinition } from "../registry.js";

export const getWorkbookOverview: ToolDefinition = {
  name: "get_workbook_overview",
  description:
    "Get the workbook structure: sheets with used ranges and header rows, tables, named ranges, active sheet, and current selection. Call this first to orient yourself.",
  level: "read",
  parameters: { type: "object", properties: {} },
  async handler(_args, ctx) {
    const overview = await ctx.host.getOverview();
    const lines: string[] = [];
    lines.push(`Active sheet: ${overview.activeSheet}`);
    if (overview.selection) lines.push(`Selection: ${overview.selection.sheet}!${overview.selection.address}`);
    for (const s of overview.sheets) {
      lines.push(`- ${s.name}: ${s.usedRange ? `${s.usedRange} (${s.rowCount}x${s.colCount})` : "empty"}`);
      if (s.headers.length) lines.push(`  headers: ${s.headers.map((h) => h || "·").join(" | ")}`);
      for (const t of s.tables) lines.push(`  table ${t.name} @ ${t.range}: ${t.columns.join(" | ")}`);
    }
    if (overview.namedRanges.length) {
      lines.push("Named ranges:");
      for (const nr of overview.namedRanges) lines.push(`- ${nr.name} = ${nr.refersTo}`);
    }
    return lines.join("\n");
  },
};
