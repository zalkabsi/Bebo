# Contributing to Bebo

Thanks for helping build an open AI agent for Office. The codebase is deliberately
small and modular: the **tool registry** is the single source of truth, and both the
agent loop and the UI render from it.

## Setup

```bash
npm install
npm run dev         # task pane on :3000 (mock workbook in a plain browser)
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build
```

All four must pass before a PR is merged (CI enforces this on Node 22).

## Add a tool in ~30 minutes

1. Create `src/tools/excel/my_tool.ts`:

```ts
import type { ToolDefinition } from "../registry.js";

export const myTool: ToolDefinition = {
  name: "my_tool",
  description: "One sentence the model reads to decide when to use this.",
  level: "read", // "read" | "mutate" | "structure"
  parameters: {
    type: "object",
    properties: {
      address: { type: "string", description: "A1-style range, e.g. B2:D9" },
    },
    required: ["address"],
  },
  async handler(args, ctx) {
    const data = await ctx.host.readRange("Sheet1", String(args.address));
    return JSON.stringify(data.values);
  },
};
```

2. Register it in `src/tools/excel/index.ts` (import + add to `excelTools`).
3. If it mutates, pick `level: "mutate"` (content) or `"structure"` (rows/cols/sheets).
   The permission engine and auto-checkpointing key off the level — no extra work.
4. Add a test in `tests/` using `MockHost` (`src/host/mock.ts`). No network, no Office.

Rules of thumb:

- Tools never import Office.js — they talk to `ctx.host` (`src/host/types.ts`), so they
  run against the mock in tests.
- Return compact strings (JSON or markdown-ish). The result goes straight into the
  model's context.
- Prefer failing loudly with a useful message over guessing.

## Add a native provider in ~30 minutes

1. Create `src/providers/myprovider.ts` implementing the `Provider` interface from
   `src/providers/types.ts`: `streamChat(req)` returns an `AsyncIterable` of
   `{ type: "text" }`, `{ type: "tool_call" }`, `{ type: "usage" }`, or
   `{ type: "done" }` deltas.
2. If the API is OpenAI-compatible, reuse `openai.ts` with a different default
   `baseURL` — that's how DeepSeek and Ollama are supported. Users can also add and save
   multiple compatible endpoints from Settings without changing code.
3. Register it in `src/providers/registry.ts` (`registerProvider`).
4. Settings (apiKey, baseURL, model) are persisted automatically per provider.

Key rule: **BYOK only.** Keys go from `localStorage` straight to the provider's
endpoint. Never add a proxy that sees user keys.

## Code style

- Modern TypeScript, ESM (`import ... from "./x.js"` with `.js` extensions).
- No comments explaining what code does; reserve comments for the genuinely
  non-obvious. Match the surrounding idioms.
- Tests use Vitest + the mock host; no network in tests.

## Reporting issues

Bugs and feature requests go through GitHub Issues. Please include whether you were
running in Excel (which platform) or browser dev mode, and the provider/model used.
