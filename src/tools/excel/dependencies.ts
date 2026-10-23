import { parseA1 } from "../../host/address.js";
import type { ToolContext, ToolDefinition } from "../registry.js";

const REF_RE = /(?:'?([A-Za-z0-9_ ]+)'?!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)/g;

interface Ref {
  sheet: string | null;
  address: string;
}

function extractRefs(formula: string): Ref[] {
  const refs: Ref[] = [];
  for (const m of formula.matchAll(REF_RE)) {
    refs.push({ sheet: m[1] ?? null, address: m[2].replace(/\$/g, "").toUpperCase() });
  }
  return refs;
}

function normalizeRef(ref: Ref, defaultSheet: string): string {
  return `${ref.sheet ?? defaultSheet}!${ref.address}`;
}

export const traceDependencies: ToolDefinition = {
  name: "trace_dependencies",
  description:
    "Trace precedents (cells this formula reads) and dependents (cells whose formulas reference this cell) for a given cell.",
  level: "read",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string" },
      address: { type: "string", description: "Single cell, e.g. C5" },
    },
    required: ["sheet", "address"],
  },
  async handler(args, ctx) {
    const sheet = String(args.sheet);
    const address = String(args.address).toUpperCase();
    const self = `${sheet}!${address}`;
    const formulas = await ctx.host.listFormulas();

    const own = formulas.find((f) => f.sheet === sheet && f.address === address);
    const lines: string[] = [];
    if (own) {
      lines.push(`${self} = ${own.formula}`);
      const precedents = extractRefs(own.formula).map((r) => normalizeRef(r, sheet));
      lines.push(`precedents: ${precedents.length ? [...new Set(precedents)].join(", ") : "(none)"}`);
    } else {
      lines.push(`${self} has no formula (or is empty).`);
    }

    const dependents = formulas.filter((f) =>
      extractRefs(f.formula).some((r) => {
        if ((r.sheet ?? f.sheet) !== sheet) return false;
        if (!r.address.includes(":")) return r.address === address;
        return rangeContains(r.address, address);
      }),
    );
    lines.push(
      dependents.length
        ? `dependents: ${dependents.map((d) => `${d.sheet}!${d.address}`).join(", ")}`
        : "dependents: (none)",
    );
    return lines.join("\n");
  },
};

function rangeContains(rangeAddress: string, address: string): boolean {
  try {
    const [start, end] = rangeAddress.split(":");
    const a = parseA1(address);
    const s = parseA1(start);
    const e = parseA1(end);
    return a.row >= s.row && a.row <= e.row && a.col >= s.col && a.col <= e.col;
  } catch {
    return false;
  }
}

export const explainFormula: ToolDefinition = {
  name: "explain_formula",
  description: "Explain a formula: the formula itself, each referenced range, and the current values of those references.",
  level: "read",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string" },
      address: { type: "string" },
    },
    required: ["sheet", "address"],
  },
  async handler(args, ctx) {
    const sheet = String(args.sheet);
    const address = String(args.address).toUpperCase();
    const formulas = await ctx.host.listFormulas();
    const own = formulas.find((f) => f.sheet === sheet && f.address === address);
    if (!own) return `${sheet}!${address} has no formula.`;

    const lines = [`${sheet}!${address} = ${own.formula}`];
    const refs = [...new Map(extractRefs(own.formula).map((r) => [normalizeRef(r, sheet), r])).values()];
    for (const ref of refs) {
      const refSheet = ref.sheet ?? sheet;
      try {
        const data = await ctx.host.readRange(refSheet, ref.address);
        const preview = data.values
          .flat()
          .slice(0, 8)
          .map((v) => (v === null ? "·" : String(v)))
          .join(", ");
        lines.push(`- ${refSheet}!${ref.address}: ${preview}${data.values.flat().length > 8 ? ", …" : ""}`);
      } catch {
        lines.push(`- ${refSheet}!${ref.address}: (unreadable)`);
      }
    }
    return lines.join("\n");
  },
};

export const askUser: ToolDefinition = {
  name: "ask_user",
  description: "Ask the user a clarifying question mid-task and wait for their answer. Use sparingly, only when blocked.",
  level: "read",
  parameters: {
    type: "object",
    properties: { question: { type: "string" } },
    required: ["question"],
  },
  async handler(args, ctx: ToolContext) {
    return ctx.ask(String(args.question));
  },
};
