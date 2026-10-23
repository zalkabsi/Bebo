import type { PermissionRequestInfo, ToolLevel } from "./types.js";

export type PermissionAction = "allow" | "ask" | "deny";
export type PermissionDecision = "allow_once" | "always_allow" | "deny";

export interface PermissionPolicy {
  read: PermissionAction;
  mutate: PermissionAction;
  structure: PermissionAction;
  planMode: boolean;
}

export const DEFAULT_POLICY: PermissionPolicy = {
  read: "allow",
  mutate: "ask",
  structure: "ask",
  planMode: false,
};

export class PermissionDeniedError extends Error {
  constructor(
    readonly toolName: string,
    readonly reason: string,
  ) {
    super(`Permission denied for ${toolName}: ${reason}`);
    this.name = "PermissionDeniedError";
  }
}

export type PermissionHandler = (req: PermissionRequestInfo) => Promise<PermissionDecision>;

export class PermissionEngine {
  private alwaysAllowed = new Set<string>();

  constructor(
    private policy: PermissionPolicy = { ...DEFAULT_POLICY },
    private handler?: PermissionHandler,
  ) {}

  setPolicy(policy: Partial<PermissionPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  getPolicy(): PermissionPolicy {
    return { ...this.policy };
  }

  resetAlwaysAllow(): void {
    this.alwaysAllowed.clear();
  }

  actionFor(toolName: string, level: ToolLevel): PermissionAction {
    if (this.policy.planMode && level !== "read") return "deny";
    // Structure and unclassified external-app tools can delete or replace user content.
    // Keep them behind a fresh confirmation even if a broader policy or prior tool grant exists.
    if (level === "structure") return this.policy.structure === "deny" ? "deny" : "ask";
    if (this.alwaysAllowed.has(toolName)) return "allow";
    return this.policy[level];
  }

  async authorize(toolName: string, level: ToolLevel, args: Record<string, unknown>): Promise<void> {
    const action = this.actionFor(toolName, level);
    if (action === "allow") return;
    if (action === "deny") {
      const reason = this.policy.planMode && level !== "read"
        ? "plan mode is active — the agent may only read"
        : `policy denies ${level} tools`;
      throw new PermissionDeniedError(toolName, reason);
    }
    if (!this.handler) throw new PermissionDeniedError(toolName, "no permission handler registered");
    const decision = await this.handler({ toolName, level, arguments: args, alwaysConfirm: level === "structure" });
    if (decision === "always_allow") {
      if (level !== "structure") this.alwaysAllowed.add(toolName);
      return;
    }
    if (decision === "allow_once") return;
    throw new PermissionDeniedError(toolName, "denied by user");
  }
}
