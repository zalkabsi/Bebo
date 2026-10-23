import type { CellFormat } from "../../host/types.js";
import type { ToolDefinition } from "../registry.js";

export const formatCells: ToolDefinition = {
  name: "format_cells",
  description: "Apply formatting to a range: bold, italic, font size/color, fill color, number format, alignment.",
  level: "mutate",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string" },
      address: { type: "string" },
      format: {
        type: "object",
        properties: {
          bold: { type: "boolean" },
          italic: { type: "boolean" },
          fontSize: { type: "number" },
          fontColor: { type: "string", description: "Hex color, e.g. #FF0000" },
          fillColor: { type: "string", description: "Hex color, e.g. #FFFF00" },
          numberFormat: { type: "string", description: "e.g. 0.00%, #,##0, yyyy-mm-dd" },
          horizontalAlign: { type: "string", enum: ["left", "center", "right"] },
        },
      },
    },
    required: ["sheet", "address", "format"],
  },
  async handler(args, ctx) {
    const sheet = String(args.sheet);
    const address = String(args.address);
    const format = args.format as CellFormat;
    await ctx.host.setFormat(sheet, address, format);
    ctx.recordChange?.(`formatted ${sheet}!${address}`);
    return `Applied formatting to ${sheet}!${address}.`;
  },
};
