import { describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/agent/checkpoints.js";
import { runAgentLoop } from "../src/agent/loop.js";
import { PermissionEngine, type PermissionDecision } from "../src/agent/permissions.js";
import type { AgentEvent, ChatMessage } from "../src/agent/types.js";
import { MockHost } from "../src/host/mock.js";
import { createExcelToolRegistry } from "../src/tools/excel/index.js";
import { call, FakeProvider } from "./helpers.js";

function setup(opts?: {
  provider?: FakeProvider;
  onPermission?: (toolName: string) => PermissionDecision;
}) {
  const host = new MockHost({ Sheet1: { A1: "Name", B1: "Qty", A2: "apples", B2: 3 } });
  const provider = opts?.provider ?? new FakeProvider();
  const checkpoints = new CheckpointStore(host);
  const requests: string[] = [];
  const permissions = new PermissionEngine(undefined, async (req) => {
    requests.push(req.toolName);
    return opts?.onPermission?.(req.toolName) ?? "allow_once";
  });
  const events: AgentEvent[] = [];
  const base: ChatMessage[] = [
    { role: "system", content: "test" },
    { role: "user", content: "do the task" },
  ];
  const run = () =>
    runAgentLoop(base, {
      provider,
      model: "fake-model",
      apiKey: "n/a",
      tools: createExcelToolRegistry(),
      permissions,
      checkpoints,
      host,
      askUser: async () => "42",
      onEvent: (e) => events.push(e),
      maxTurns: 5,
    });
  return { host, provider, checkpoints, permissions, events, requests, run };
}

describe("agent loop", () => {
  it("executes a scripted multi-tool task end-to-end", async () => {
    const provider = new FakeProvider();
    provider.scripts = [
      { text: "Let me look.", toolCalls: [call("get_workbook_overview")] },
      {
        text: "Now writing.",
        toolCalls: [call("write_cells", { sheet: "Sheet1", address: "A4:B4", values: [["pears", 7]] })],
      },
      { text: "Done — added pears." },
    ];
    const { host, events, checkpoints, requests, run } = setup({ provider });
    const history = await run();

    expect(provider.requests.length).toBe(3);
    const written = await host.readRange("Sheet1", "A4:B4");
    expect(written.values).toEqual([["pears", 7]]);

    const toolEnds = events.filter((e) => e.type === "tool_call_end");
    expect(toolEnds.map((e) => (e as { call: { name: string } }).call.name)).toEqual([
      "get_workbook_overview",
      "write_cells",
    ]);
    expect(events.some((e) => e.type === "checkpoint")).toBe(true);
    expect(checkpoints.list().length).toBe(1);
    expect(events.at(-1)).toEqual({ type: "done", reason: "stop" });
    expect(requests).toEqual(["write_cells"]);

    const toolMessages = history.filter((m) => m.role === "tool");
    expect(toolMessages.length).toBe(2);
    expect(toolMessages[1].content).toContain("verified");
  });

  it("reports permission denial back to the model as a tool error", async () => {
    const provider = new FakeProvider();
    provider.scripts = [
      { toolCalls: [call("write_cells", { sheet: "Sheet1", address: "A3:B3", values: [["x", 1]] })] },
      { text: "Understood, cannot write." },
    ];
    const { host, events, run } = setup({ provider, onPermission: () => "deny" });
    const history = await run();

    const toolMsg = history.find((m) => m.role === "tool");
    expect(toolMsg && "isError" in toolMsg && toolMsg.isError).toBe(true);
    expect(toolMsg?.content).toContain("Permission denied");
    const cell = await host.readRange("Sheet1", "A3:B3");
    expect(cell.values).toEqual([[null, null]]);
    expect(events.some((e) => e.type === "checkpoint")).toBe(false);
  });

  it("stops at the max-turns guard", async () => {
    const provider = new FakeProvider();
    provider.scripts = Array.from({ length: 10 }, () => ({
      toolCalls: [call("get_workbook_overview")],
    }));
    const { events, run } = setup({ provider });
    await run();
    expect(events.at(-1)).toEqual({ type: "done", reason: "max_turns" });
  });

  it("supports abort mid-run", async () => {
    const provider = new FakeProvider();
    provider.scripts = [{ toolCalls: [call("get_workbook_overview")] }, { text: "never" }];
    const { events } = setup({ provider });
    const controller = new AbortController();
    controller.abort();
    const history = await runAgentLoop(
      [
        { role: "system", content: "t" },
        { role: "user", content: "u" },
      ],
      {
        provider,
        model: "fake-model",
        apiKey: "n/a",
        tools: createExcelToolRegistry(),
        permissions: new PermissionEngine(undefined, async () => "allow_once"),
        checkpoints: new CheckpointStore(new MockHost()),
        host: new MockHost(),
        askUser: async () => "",
        onEvent: (e) => events.push(e),
        signal: controller.signal,
      },
    );
    expect(events.at(-1)).toEqual({ type: "done", reason: "aborted" });
    expect(history.length).toBe(2);
  });

  it("answers ask_user through the interaction handler", async () => {
    const provider = new FakeProvider();
    provider.scripts = [
      { toolCalls: [call("ask_user", { question: "How many rows?" })] },
      { text: "Got it: 42." },
    ];
    const { events, run } = setup({ provider });
    const history = await run();
    expect(events.some((e) => e.type === "ask_user" && e.question === "How many rows?")).toBe(true);
    const toolMsg = history.find((m) => m.role === "tool");
    expect(toolMsg?.content).toBe("42");
  });
});
