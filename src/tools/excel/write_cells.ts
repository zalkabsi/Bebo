import { parseRange, rangeDimensions, toA1 } from "../../host/address.js";
import type { CellValue } from "../../host/types.js";
import type { ToolDefinition } from "../registry.js";

export const writeCells: ToolDefinition = {
  name: "write_cells",
  description:
    "Write values into a range. values is a 2D array matching the range dimensions; strings starting with '=' become formulas. Refuses to overwrite non-empty cells unless overwrite=true. Writes are verified by reading back.",
  level: "mutate",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string" },
      address: { type: "string", description: "Target range, e.g. B2:D5" },
      values: { type: "array", items: { type: "array" }, description: "2D array of values" },
      overwrite: { type: "boolean", description: "Allow overwriting non-empty cells (default false)" },
    },
    required: ["sheet", "address", "values"],
  },
  async handler(args, ctx) {
    const sheet = String(args.sheet);
    const address = String(args.address);
    const values = args.values as CellValue[][];
    if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
      throw new Error("values must be a non-empty 2D array");
    }
    const overwrite = args.overwrite === true;

    const bounds = parseRange(address);
    const dims = rangeDimensions(bounds);
    if (values.length !== dims.rows || values.some((row) => row.length !== dims.cols)) {
      throw new Error(
        `values dimensions ${values.length}x${values[0].length} do not match range ${address} (${dims.rows}x${dims.cols})`,
      );
    }

    const before = await ctx.host.readRange(sheet, address);
    if (!overwrite) {
      const blocked: string[] = [];
      before.values.forEach((row, r) => {
        row.forEach((v, c) => {
          const hasFormula = before.formulas[r][c] !== null;
          if ((v !== null && v !== "") || hasFormula) {
            blocked.push(toA1({ row: bounds.startRow + r, col: bounds.startCol + c }));
          }
        });
      });
      if (blocked.length > 0) {
        throw new Error(
          `Refusing to overwrite ${blocked.length} non-empty cell(s): ${blocked.slice(0, 10).join(", ")}${blocked.length > 10 ? ", …" : ""}. Re-run with overwrite=true if this is intended.`,
        );
      }
    }

    await ctx.host.writeRange(sheet, address, values);
    ctx.recordChange?.(`wrote ${sheet}!${address} (${dims.rows}x${dims.cols})`);

    const after = await ctx.host.readRange(sheet, address);
    const mismatches: string[] = [];
    values.forEach((row, r) => {
      row.forEach((v, c) => {
        const addr = toA1({ row: bounds.startRow + r, col: bounds.startCol + c });
        if (typeof v === "string" && v.startsWith("=")) {
          if (after.formulas[r][c] !== v) mismatches.push(addr);
        } else if (String(after.values[r][c] ?? "") !== String(v ?? "")) {
          mismatches.push(addr);
        }
      });
    });
    if (mismatches.length > 0) {
      throw new Error(`Post-write verification failed at: ${mismatches.slice(0, 10).join(", ")}`);
    }
    return `Wrote ${dims.rows * dims.cols} cell(s) to ${sheet}!${address} (verified).`;
  },
};
