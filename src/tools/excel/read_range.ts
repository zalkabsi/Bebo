import type { CellValue } from "../../host/types.js";
import type { ToolDefinition } from "../registry.js";

function fmtCell(v: CellValue): string {
  if (v === null) return "";
  return String(v);
}

export const readRange: ToolDefinition = {
  name: "read_range",
  description:
    "Read a cell range. compact mode returns values only as rows (default); detailed mode also includes formulas and number formats. Read only what you need — prefer compact.",
  level: "read",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string", description: "Sheet name" },
      address: { type: "string", description: "A1-style range, e.g. A1:D20" },
      mode: { type: "string", enum: ["compact", "detailed"], description: "compact (default) or detailed" },
    },
    required: ["sheet", "address"],
  },
  async handler(args, ctx) {
    const sheet = String(args.sheet);
    const address = String(args.address);
    const mode = args.mode === "detailed" ? "detailed" : "compact";
    const data = await ctx.host.readRange(sheet, address);

    if (mode === "compact") {
      return data.values.map((row) => row.map(fmtCell).join(" | ")).join("\n");
    }
    const out: string[] = [];
    data.values.forEach((row, r) => {
      row.forEach((v, c) => {
        const formula = data.formulas[r][c];
        const format = data.formats[r][c];
        const parts = [`value=${fmtCell(v)}`];
        if (formula) parts.push(`formula=${formula}`);
        if (format?.numberFormat) parts.push(`fmt=${format.numberFormat}`);
        if (format?.bold) parts.push("bold");
        out.push(parts.join(" "));
      });
    });
    return out.join("\n");
  },
};
