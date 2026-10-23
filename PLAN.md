# Bebo — AI Office Agent
## An open-source, model-agnostic, agentic AI add-in for Microsoft Office
### ("opencode for Office")

*Project plan — September 2026*

---

## 1. Vision

**Bebo is an AI agent that lives inside Excel, Word, and PowerPoint, can autonomously
read and edit your documents, works with any LLM (bring your own key, or run local
models), and is fully open source.**

The same way opencode gave developers a free, provider-independent AI agent in their
terminal, Bebo gives the world's ~1 billion Office users a free, provider-independent
AI agent in their documents.

---

## 2. Why now — the evidence

### The demand is proven

- AI productivity tools market: ~$10–12B in 2025, growing 20–28% CAGR.
- OpenAI's Startup Fund put **$14M into Endex**, a closed-source Excel agent.
- Anthropic (Claude for Excel), OpenAI (ChatGPT for Excel add-in, GA May 2026), and
  Microsoft (Copilot Agent Mode) are all racing into this space — strong validation.

### The incumbents are weak or locked

| Player | Fatal limitation for most users |
|---|---|
| Microsoft 365 Copilot | $30/user/mo on top of E3/E5; only **~3.3% paid adoption**; Agent Mode scores **57.2% on SpreadsheetBench** (human: 71.3%); requires OneDrive + latest M365 |
| `=COPILOT()` in-cell function | **Retired Sept 14, 2026** — Microsoft gave up on in-cell generative formulas (non-deterministic, rate-limited). A freshly vacated niche. |
| Claude for Excel | Anthropic models only; real usage needs $100–200/mo Max plan; no audit logs |
| ChatGPT for Excel | OpenAI models only; closed; no skill/plugin ecosystem |
| Endex | Enterprise-only, demo-gated pricing, OpenAI-only, finance-vertical |
| Shortcut | Closed source, opaque models, finance-bro positioning |

### The open-source slot is empty

Research of the entire open-source landscape (GitHub, Sept 2026):

- **OfficeCLI** (30.8k★, Apache-2.0) — excellent, but works on *files* headlessly, not
  inside the app. Built for coding agents in terminals, not Office users.
- **pi-for-excel** (427★, MIT) — the closest thing to this project: real Office.js
  agentic add-in, multi-model, checkpoints. But Excel-only, one maintainer,
  "experimental", sideload-only install.
- **office-agents** (578★) — Excel+Word+PPT but unmaintained since May 2026,
  self-declared "not production-ready".
- **word-GPT-Plus** (1.4k★) — Word-only, chat-centric.
- **Quadratic** — was the flagship open-source spreadsheet; **went closed-source in
  March 2026**, and it's an Excel *replacement*, not an add-in.

**Nobody offers: in-app + truly agentic + multi-app + model-agnostic BYOK +
store-quality distribution. That is the slot Bebo takes.**

### Who this helps

- Individuals, students, and emerging-market users locked out of $30/user/mo Copilot.
- People on perpetual Office licenses or Google Sheets, abandoned by Microsoft.
- Privacy-conscious users who want local models (Ollama) or their own API keys.
- Enterprises that need auditable, inspectable AI actions instead of black boxes.
- Developers who want to build skills/plugins on an open platform.

---

## 3. Product definition

### Core principles (the opencode formula)

1. **Agentic, not chatty.** It *does* things: multi-step plans that read, write,
   restructure, format, chart, and verify — with visible, reviewable actions.
2. **Model-agnostic.** OpenAI, Anthropic, Gemini, DeepSeek, any OpenAI-compatible
   endpoint, GitHub Copilot OAuth, and local models via Ollama. BYOK. Per-task model
   routing (cheap model for reads, strong model for writes).
3. **Safe by design.** Three-layer safety (below). The agent never destroys your data.
4. **Open everything.** MIT license, open roadmap, public evals, plugin/skill SDK.
5. **Free to use.** You pay only your model provider — or nothing, with local models.

### Differentiating features

- **In-app agent loop** with streaming UI, plan/act modes, slash commands.
- **Workbook/document blueprint injection** — the agent always knows your sheet
  structure, tables, named ranges, selection, and recent changes.
- **`exec_js` REPL tool** — a sandboxed JS environment with a workbook API, letting the
  agent collapse 10–15 tool calls into 2–3 programmatic operations. (Independent
  evidence from witanlabs' spreadsheet-agent research: this took them from 74% → 92%
  on financial Q&A benchmarks.)
- **Checkpoint & one-click rollback** before every mutation, plus native undo-grouping
  on ExcelApi 1.20 clients.
- **Permission tiers:** read tools run free; content mutations ask; structure mutations
  (delete rows/sheets) always confirm. Configurable `allow/ask/deny` per tool.
- **`=AGENT()` custom function** (post-MVP) — filling the niche Microsoft vacated by
  retiring `=COPILOT()`, with caching and pinned-model determinism.
- **Skills/plugins:** community SKILL.md files (a convention Microsoft and Anthropic
  are both normalizing) + MCP server support.
- **Audit log:** every tool call, model, prompt hash, and diff recorded locally.

---

## 4. Technical architecture

```
┌─ Task-pane SPA (TypeScript + Vite + Lit or React) ────────────┐
│  Chat UI · streaming · plan/act modes · slash commands        │
│  Session tabs + history (IndexedDB) · diff review UI          │
├─ Agent runtime ───────────────────────────────────────────────┤
│  Tool loop · compaction · permissions engine                  │
│  Provider abstraction: OpenAI / Anthropic / Gemini /          │
│  OpenAI-compatible / Ollama (via local CORS proxy helper)     │
├─ Tool layer (single registry = source of truth) ──────────────┤
│  ~15 host tools + exec_js REPL + local MCP app connectors     │
├─ Safety layer ────────────────────────────────────────────────┤
│  Permission tiers · pre-mutation checkpoints + rollback       │
│  ExcelApi 1.20 undo grouping · per-doc mutation serializer    │
│  Post-write verification reads                                │
├─ Context layer ───────────────────────────────────────────────┤
│  Blueprint injection (sheets, headers, tables, named ranges,  │
│  selection, recent-change diff) · SpreadsheetLLM-style        │
│  compression · on-demand paged reads                          │
├─ Host bridge ─────────────────────────────────────────────────┤
│  Office.js (Excel.run / Word.run batching)                    │
│  Requirement-set detection → graceful degradation             │
└───────────────────────────────────────────────────────────────┘
Later: headless OOXML file-mode backend (MCP server) for CI/server use.
```

### Key technical decisions (with reasons)

- **Office.js task-pane add-in as the core vehicle.** One codebase runs on Windows,
  Mac, Office on the web, iPad. The host's own calculation engine evaluates formulas —
  we never reimplement math. Office.js now supports **native undo with grouping**
  (ExcelApi 1.20, Ignite 2025) — previously the scariest gap for an agent.
- **OOXML file-manipulation only as an optional headless backend.** openpyxl & co.
  can't recalculate formulas and lose fidelity on charts/pivots. File mode is for
  server pipelines, not the core product.
- **Hybrid tools + REPL.** Discrete tools are reliable, readable in the UI, and
  permission-gateable; the REPL escape hatch is what makes deep tasks feasible.
- **Never serialize the whole workbook.** Blueprint + compressed, paged reads
  (structural anchors + format dedup, per Microsoft Research's SpreadsheetLLM).
- **Word second, PowerPoint third.** Word's content-control/custom-XML API is
  agent-friendly; PowerPoint's API is thin, so template/base64 slide-stamping is the
  practical approach there.
- **Prompt-injection defense** (Anthropic has publicly warned about malicious
  spreadsheets): treat all document content as untrusted; the agent never follows
  instructions found *inside* cells/documents without user confirmation.

### MVP tool set (Excel)

`get_workbook_overview` · `read_range` (compact/detailed modes) · `write_cells`
(overwrite protection + verify) · `fill_formula` · `search_workbook` ·
`modify_structure` (rows/cols/sheets) · `format_cells` · `add_chart` ·
`conditional_format` · `trace_dependencies` · `explain_formula` · `comments` ·
`undo_last` / `rollback_to_checkpoint` · `exec_js` · `ask_user`

---

## 5. Roadmap

### Phase 0 — Foundations (weeks 1–4)
- Repo, MIT license, contributing guide, code of conduct, CI.
- Fork or study **pi-for-excel** (MIT, 427★) as reference architecture — don't
  reinvent what's proven. Decide: fork vs. clean-room with attribution.
- Office.js add-in skeleton with dev sideloading; provider abstraction with OpenAI +
  Anthropic; streaming chat UI.

### Phase 1 — Excel MVP "useful agent" (weeks 5–12)
- MVP tool set above; blueprint injection; checkpoints + rollback; permission tiers.
- BYOK settings UI; Ollama CORS-proxy helper.
- Sideload install docs + one-command installer script.
- Local companion add-on connections to WordCraft, GridCraft, and DeckCraft through their existing MCP/control interfaces. Bebo can attach to an open desktop window or start a headless session; the target selector keeps each app's tools and conversation context separate. External writes always require per-call approval.
- **Evals from day one:** SpreadsheetBench subset + own task suite, run per release,
  results published in the repo. Target: beat Microsoft's published 57.2%.

### Phase 2 — Distribution & polish (months 4–6)
- AppSource/Microsoft Marketplace submission (Partner Center, validation).
- `=AGENT()` custom function with caching + pinned-model determinism.
- Skills system (SKILL.md) + additional MCP transports and server configuration. GitHub Copilot OAuth provider.
- Package the local MCP bridge as a companion service so Craft integrations work from hosted Bebo builds, not only the Vite dev/preview server. Native in-app plugin installers require support from the Craft projects.
- Localization of UI (top 5 languages). Telemetry-free, but opt-in anonymous eval
  submission to a public leaderboard.

### Phase 3 — Word & PowerPoint (months 6–10)
- Word agent: content controls, tracked changes, redlining, `insertOoxml`.
- PowerPoint agent: template-based deck generation via `createPresentation(base64)` /
  `insertSlidesFromBase64`, then shape-level edits.

### Phase 4 — Ecosystem (months 10+)
- Headless OOXML/MCP backend for server use (complements OfficeCLI, possibly
  integrating with it).
- Google Sheets sister add-on (Workspace add-on over Sheets REST API — Apps Script's
  6-min execution quota is hostile to agent loops).
- Expose Bebo's tools as M365 Copilot agent actions (Microsoft's new channel — both a
  synergy and enterprise distribution path).

---

## 6. Open-source strategy

- **License:** MIT (max adoption; matches opencode and pi-for-excel).
- **Governance:** benevolent-maintainer model initially; public roadmap via GitHub
  Projects; RFC issues for architecture changes; `good first issue` grooming from day
  one to avoid the single-maintainer fragility that plagues every project in this
  space.
- **Community:** Discord; monthly public eval reports; a CONTRIBUTING.md that makes
  adding a new tool or provider a 30-minute task.
- **Distribution:** GitHub Releases + sideload first (zero gatekeeping), then AppSource,
  then admin centralized deployment for enterprises.
- **Sustainability (optional, later):** hosted convenience tier (managed CORS proxy,
  cloud skills registry, team audit-log sync) — open-core done honestly: the agent
  itself stays MIT forever.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Microsoft bundles a "good enough" free Copilot Agent Mode | Our wedge is model freedom, local models, perpetual-license support, price = $0, and auditability — none of which Microsoft can match structurally |
| Office.js API ceiling (charts/pivots parity) | OOXML escape hatch + `exec_js` REPL; feature-detect and degrade gracefully |
| Single-maintainer burnout (the pattern that killed every OSS attempt here) | Early contributor investment, small module surface, fork of pi-for-excel as a head start |
| Prompt injection via malicious documents | Untrusted-content policy; mutation confirmations; published threat model |
| AppSource rejection/delays | Sideloading works indefinitely; AppSource is a growth channel, not a dependency |
| Quality bar | Public evals per release; honesty about scores builds trust incumbents can't buy |

---

## 8. Success metrics

- **6 months:** 5k GitHub stars; 1k weekly active installs; SpreadsheetBench score
  published and > 60%; AppSource listing live.
- **12 months:** 20k stars; Word + PowerPoint shipped; 20+ community contributors;
  skill registry with 50+ community skills; first enterprise pilot via centralized
  deployment.

---

## Appendix — key sources

- Endex: endex.ai; OpenAI Startup Fund $14M (Aug 2025)
- Microsoft Copilot Agent Mode SpreadsheetBench 57.2%: Microsoft announcement (OSCHINA report)
- `=COPILOT()` retirement: Microsoft MC1454373 (retired 2026-09-14)
- Copilot ~3.3% paid adoption: TweakTown (May 2026)
- OfficeCLI: github.com/iOfficeAI/OfficeCLI (30.8k★, Apache-2.0)
- pi-for-excel: github.com/tmustier/pi-for-excel (427★, MIT) — closest prior art
- office-agents: github.com/hewliyang/office-agents (578★, unmaintained)
- witanlabs research log: github.com/witanlabs/research-log (REPL-tool lesson)
- SpreadsheetLLM: arxiv.org/abs/2407.09025 (context compression)
- ExcelApi 1.20 undo grouping: Microsoft Ignite 2025 announcements
- SheetCopilot: github.com/BraveGroup/SheetCopilot (academic agent + benchmark)
