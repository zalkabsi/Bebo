import type { ToolDefinition } from "../registry.js";

export const fillFormula: ToolDefinition = {
  name: "fill_formula",
  description:
    "Fill a formula across a range (relative references adjust per cell, like Excel autofill). Use for calculated columns and row-wise computations.",
  level: "mutate",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string" },
      address: { type: "string", description: "Target range, e.g. C2:C100" },
      formula: { type: "string", description: "Formula as written for the first cell, e.g. =A2*B2" },
    },
    required: ["sheet", "address", "formula"],
  },
  async handler(args, ctx) {
    const sheet = String(args.sheet);
    const address = String(args.address);
    const formula = String(args.formula);
    await ctx.host.setFormula(sheet, address, formula);
    ctx.recordChange?.(`filled formula ${formula} in ${sheet}!${address}`);
    const after = await ctx.host.readRange(sheet, address);
    const missing: string[] = [];
    after.formulas.forEach((row, r) =>
      row.forEach((f, c) => {
        if (!f) missing.push(`${r},${c}`);
      }),
    );
    if (missing.length > 0) throw new Error(`Formula fill verification failed (${missing.length} cells missing formulas)`);
    return `Filled ${formula} into ${sheet}!${address} (verified).`;
  },
};
