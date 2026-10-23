import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, PermissionDeniedError, PermissionEngine } from "../src/agent/permissions.js";

describe("permission engine", () => {
  it("allows read tools by default without asking", async () => {
    let asked = 0;
    const engine = new PermissionEngine(undefined, async () => {
      asked++;
      return "allow_once";
    });
    await engine.authorize("read_range", "read", {});
    expect(asked).toBe(0);
  });

  it("asks for mutate and structure by default", async () => {
    const asked: string[] = [];
    const engine = new PermissionEngine(undefined, async (req) => {
      asked.push(req.toolName);
      return "allow_once";
    });
    await engine.authorize("write_cells", "mutate", {});
    await engine.authorize("modify_structure", "structure", {});
    expect(asked).toEqual(["write_cells", "modify_structure"]);
  });

  it("denies when policy says deny", async () => {
    const engine = new PermissionEngine({ ...DEFAULT_POLICY, mutate: "deny" });
    await expect(engine.authorize("write_cells", "mutate", {})).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("plan mode denies all mutations but allows reads", async () => {
    const engine = new PermissionEngine({ ...DEFAULT_POLICY, planMode: true });
    await engine.authorize("read_range", "read", {});
    await expect(engine.authorize("write_cells", "mutate", {})).rejects.toThrow(/plan mode/);
    await expect(engine.authorize("modify_structure", "structure", {})).rejects.toThrow(/plan mode/);
    await expect(engine.authorize("exec_js", "mutate", {})).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("always_allow caches the decision per tool", async () => {
    let asked = 0;
    const engine = new PermissionEngine(undefined, async () => {
      asked++;
      return "always_allow";
    });
    await engine.authorize("write_cells", "mutate", {});
    await engine.authorize("write_cells", "mutate", {});
    expect(asked).toBe(1);
    engine.resetAlwaysAllow();
    await engine.authorize("write_cells", "mutate", {});
    expect(asked).toBe(2);
  });

  it("deny decision from the user rejects", async () => {
    const engine = new PermissionEngine(undefined, async () => "deny");
    await expect(engine.authorize("format_cells", "mutate", {})).rejects.toThrow(/denied by user/);
  });
});
