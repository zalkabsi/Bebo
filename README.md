# Bebo — AI Office Agent

An open-source, model-agnostic, agentic AI add-in for Microsoft Office — Excel first.
Think "opencode for Office": an AI agent that lives inside your spreadsheet, can read
and edit it autonomously, and works with **any** LLM. MIT licensed.

## Features

- **Agentic, not chatty.** Multi-step plans that read, write, restructure, format,
  chart, and verify — with visible, reviewable actions.
- **Model-agnostic BYOK.** OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and multiple
  custom OpenAI-compatible endpoints. Your keys, your models — or a local model without
  provider API fees.
- **Accessible provider setup.** Configure a provider and test the connection with a short,
  generic prompt that does not include workbook data or chat history.
- **Safe by design.** Three permission tiers (`read` runs free, `mutate` asks,
  `structure` always confirms), automatic checkpoints before every mutation, and
  one-click rollback. Plan mode for read-only exploration.
- **Workbook blueprint injection.** The agent always knows your sheets, headers,
  tables, named ranges, and selection — without dumping whole grids into context.
- **`exec_js` REPL.** A sandboxed JS environment with a workbook API, so the agent can
  collapse many small tool calls into a few programmatic operations.
- **Privacy first.** API keys live in your browser's `localStorage` and are sent only
  to the provider endpoint you configure. No telemetry.
- **Craft app add-on.** Attach the Bebo companion pane to an open WordCraft, GridCraft, or
  DeckCraft window through its local MCP/control bridge, or start a separate headless session.
  Bebo discovers the app's tools and uses your selected AI provider to work with it.
- **Community project quick starts.** Start a project plan from verified observations, draft
  accessible updates, or create a blank Excel action tracker that uses volunteer roles and
  public evidence instead of personal details. Bebo does not invent local facts or example people.

## Quickstart

```bash
npm install
npm run dev        # serves the task pane at https://localhost:3000 (http in dev)
```

### Sideload into Excel

1. **Office on the web:** open [Excel on the web](https://excel.office.com) →
   Insert → Add-ins → Manage My Add-ins → Upload My Add-in → pick `manifest.xml`.
2. **Windows desktop:** copy `manifest.xml` into a shared folder, register it under
   File → Options → Trust Center → Trusted Add-in Catalogs, restart Excel, then
   Insert → My Add-ins → Shared Folder.
3. **Mac:** `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/` — drop the
   manifest there, restart Excel.

Before sideloading, edit `manifest.xml`: generate your own GUID for `Id` and confirm
the URLs (default `https://localhost:3000`). To use a hosted build instead of the dev
server, run `npm run build`, host `dist/` on any static HTTPS host, and point every
`localhost:3000` URL in the manifest at it.

> Note: Office expects HTTPS. For dev you can trust Vite's basic SSL plugin or run a
> local reverse proxy; Office on the web also accepts `http://localhost` in some
> browsers. See the `manifest.xml` comments.

### Dev mode without Office

Opening `npm run dev` in a plain browser runs the UI against an in-memory mock
workbook, so you can exercise the full agent loop (with any provider key) without
Excel.

## Architecture

```
┌─ Task pane (TypeScript + Vite + Lit) ─────────────────────────┐
│  Chat UI · streaming · tool-call cards · plan/act modes       │
│  permission prompts · checkpoint rollback chips               │
├─ Agent runtime (src/agent) ───────────────────────────────────┤
│  tool-use loop · permissions engine · checkpoints ·           │
│  workbook blueprint context · conversation compaction         │
├─ Providers (src/providers) ───────────────────────────────────┤
│  OpenAI / Anthropic / Gemini / OpenAI-compatible · registry   │
│  with per-provider settings in localStorage (BYOK)            │
├─ Tools (src/tools) ───────────────────────────────────────────┤
│  single registry · Excel tools + exec_js + connected MCP tools │
├─ Host bridge (src/host) ──────────────────────────────────────┤
│  host interface · Office.js impl (Excel.run batching) ·       │
│  in-memory mock (tests + browser dev mode)                    │
└───────────────────────────────────────────────────────────────┘
```

## Roadmap

- **Phase 0–1 (this repo):** Excel MVP — agent loop, tool set, permissions,
  checkpoints, BYOK settings, sideload install, and local MCP connections to
  WordCraft, GridCraft, and DeckCraft.
- **Phase 2:** AppSource submission, `=AGENT()` custom function, skills (SKILL.md),
  additional MCP transports, localization.
- **Phase 3:** Word & PowerPoint agents.
- **Phase 4:** headless OOXML/MCP backend, Google Sheets sister add-on.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a tool or a provider is designed to be
a ~30-minute task.

## Bebo for WordCraft, GridCraft, and DeckCraft

Bebo works as a companion add-on for [WordCraft](https://github.com/storytold/wordcraft),
[GridCraft](https://github.com/storytold/gridcraft), and [DeckCraft](https://github.com/storytold/deckcraft).
It uses the apps' supported MCP and local control interfaces, so Bebo can work on the document
open in each app without duplicating its document API. The local Vite companion starts the app's
CLI only after you choose **Attach** or **Start** in Settings.

### Attach to an open app window

1. Install the app and its CLI (`wordcraft-cli`, `gridcraft-cli`, or `deckcraft-cli`).
2. Start the desktop app with its local control port:

   | App | Start command | Default port |
   | --- | --- | --- |
   | WordCraft | `wordcraft --control 7981` | `7981` |
   | GridCraft | `gridcraft --control 7979` | `7979` |
   | DeckCraft | `deckcraft --control 7990` | `7990` |

3. Run Bebo with `npm run dev`, open the local Bebo page, then open **Settings → Bebo for Craft apps**.
   Choose **Attach to open window** and click **Attach** for the app. The default port is filled in;
   you can change it if you started the app on another port.

The Bebo pane can stay beside the Craft app while you work. The control ports bind to the local
machine; use them only on a trusted device. WordCraft authenticates its control connection with the
key created by its running app, which the CLI reads automatically.

### Start a separate session

Choose **Start separate session** to let Bebo open or create a document outside a running window.
For file-based workflows, copy `bebo.mcp.example.json` to `bebo.mcp.json` and edit the command and
file roots for your machine. This local file is ignored by Git. Set `BEBO_MCP_CONFIG` to use another
config location. Existing `aioa.mcp.json` files and `AIOA_MCP_CONFIG` are still read for migration.

Both modes use local standard-I/O MCP processes. The selected AI provider receives document context
and tool results as needed to answer your request; provider keys stay in Bebo and are not passed to
the Craft apps.

To add another AI provider, open **Settings → Add another AI provider**. Enter the provider name,
its OpenAI Chat Completions API base URL, model name, and API key. Bebo keeps each endpoint as a
separate choice in the provider menu, so you can switch between accounts or gateways. This works
with OpenAI-compatible providers such as OpenRouter, Groq, LM Studio, and vLLM; native
OpenAI, Anthropic, Gemini, DeepSeek, and Ollama options are already available. The custom endpoint
must support streaming chat completions and tool/function calling. Provider keys stay in Bebo and
are not passed to the Craft apps.

Headless WordCraft and DeckCraft sessions support MCP read/write-root flags, so use them to confine
file access. GridCraft's current MCP guide does not document equivalent root flags. Attaching to a
desktop window works on the open document; it does not constrain the app's own file access. Bebo
only treats documented inspection tools as read-only; every other MCP action asks for confirmation
each time. The apps' own undo/history remains responsible for edits made through MCP; Bebo workbook
checkpoints cover only the Excel workbook.

The connector is available when Bebo is served locally by Vite. A statically hosted add-in cannot
launch local CLI processes; a packaged companion service is needed for that deployment model. The
Craft apps do not currently document an in-app plugin installer, so this companion pane is installed
and run alongside them rather than from an add-on marketplace.

## License

MIT — see [LICENSE](LICENSE).
