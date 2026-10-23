import type { ChartType } from "../../host/types.js";
import type { ToolDefinition } from "../registry.js";

export const addChart: ToolDefinition = {
  name: "add_chart",
  description: "Insert a chart from a data range. Types: column, bar, line, pie, scatter.",
  level: "mutate",
  parameters: {
    type: "object",
    properties: {
      sheet: { type: "string" },
      dataRange: { type: "string", description: "A1 range including headers, e.g. A1:B10" },
      type: { type: "string", enum: ["column", "bar", "line", "pie", "scatter"] },
      title: { type: "string" },
      position: { type: "string", description: "Anchor cell for the chart, e.g. E2" },
    },
    required: ["sheet", "dataRange", "type"],
  },
  async handler(args, ctx) {
    const spec = {
      sheet: String(args.sheet),
      dataRange: String(args.dataRange),
      type: String(args.type) as ChartType,
      title: args.title === undefined ? undefined : String(args.title),
      position: args.position === undefined ? undefined : String(args.position),
    };
    await ctx.host.addChart(spec);
    ctx.recordChange?.(`added ${spec.type} chart on ${spec.sheet} from ${spec.dataRange}`);
    return `Added ${spec.type} chart on ${spec.sheet} using ${spec.dataRange}.`;
  },
};
