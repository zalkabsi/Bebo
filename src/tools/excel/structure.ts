import type { StructureOp } from "../../host/types.js";
import type { ToolDefinition } from "../registry.js";

export const modifyStructure: ToolDefinition = {
  name: "modify_structure",
  description:
    "Change workbook structure: insert/delete rows or columns, add/delete/rename sheets. Row/column indexes are 0-based. Destructive — the user will be asked to confirm.",
  level: "structure",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["insertRows", "deleteRows", "insertCols", "deleteCols", "addSheet", "deleteSheet", "renameSheet"],
      },
      sheet: { type: "string", description: "Sheet name (row/col ops, deleteSheet, renameSheet)" },
      index: { type: "number", description: "0-based row/column index" },
      count: { type: "number", description: "How many rows/columns (default 1)" },
      name: { type: "string", description: "Sheet name (addSheet) or new name (renameSheet)" },
    },
    required: ["operation"],
  },
  async handler(args, ctx) {
    const operation = String(args.operation);
    const count = typeof args.count === "number" && args.count > 0 ? Math.floor(args.count) : 1;
    let op: StructureOp;
    switch (operation) {
      case "insertRows":
      case "deleteRows":
      case "insertCols":
      case "deleteCols": {
        if (typeof args.sheet !== "string" || typeof args.index !== "number") {
          throw new Error(`${operation} requires sheet and index`);
        }
        const kind = operation as "insertRows" | "deleteRows" | "insertCols" | "deleteCols";
        op = { kind, sheet: args.sheet, index: Math.floor(args.index), count };
        break;
      }
      case "addSheet":
        if (typeof args.name !== "string") throw new Error("addSheet requires name");
        op = { kind: "addSheet", name: args.name };
        break;
      case "deleteSheet":
        if (typeof args.sheet !== "string") throw new Error("deleteSheet requires sheet");
        op = { kind: "deleteSheet", name: args.sheet };
        break;
      case "renameSheet":
        if (typeof args.sheet !== "string" || typeof args.name !== "string") {
          throw new Error("renameSheet requires sheet and name");
        }
        op = { kind: "renameSheet", from: args.sheet, to: args.name };
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    await ctx.host.applyStructureOp(op);
    ctx.recordChange?.(`structure: ${operation}${"sheet" in op ? ` on ${(op as { sheet?: string }).sheet ?? ""}` : ""}`);
    return `Structure op ${operation} applied.`;
  },
};
