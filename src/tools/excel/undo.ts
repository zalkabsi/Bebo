import type { ToolDefinition } from "../registry.js";

export const undoLast: ToolDefinition = {
  name: "undo_last",
  description: "Roll back the workbook to the most recent checkpoint (the state before the last mutation batch).",
  level: "mutate",
  parameters: { type: "object", properties: {} },
  async handler(_args, ctx) {
    const latest = ctx.checkpoints.latest();
    if (!latest) return "No checkpoint available to roll back to.";
    const cp = await ctx.checkpoints.rollback(latest.id);
    ctx.recordChange?.(`rolled back to checkpoint ${cp.label}`);
    return `Rolled back to checkpoint "${cp.label}".`;
  },
};

export const rollbackToCheckpoint: ToolDefinition = {
  name: "rollback_to_checkpoint",
  description: "Roll back the workbook to a specific checkpoint by id.",
  level: "mutate",
  parameters: {
    type: "object",
    properties: { checkpointId: { type: "string" } },
    required: ["checkpointId"],
  },
  async handler(args, ctx) {
    const cp = await ctx.checkpoints.rollback(String(args.checkpointId));
    ctx.recordChange?.(`rolled back to checkpoint ${cp.label}`);
    return `Rolled back to checkpoint "${cp.label}".`;
  },
};
