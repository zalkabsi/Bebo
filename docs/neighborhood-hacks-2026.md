# Neighborhood Hacks 2026 notes

## Project framing

**Working name:** Bebo Community Access

**Draft pitch:** Bebo is building provider-choice AI assistance for office work, including local models. Its community workflow turns verified, non-identifying observations into an action tracker and accessible updates. The current prototype demonstrates the workflow in Excel; direct chat panels inside WordCraft, GridCraft, and DeckCraft remain planned.

**Problem and evidence draft:** The builder reports that many people cannot access Microsoft products, while newer office apps offer another way to work. The builder's observation is that users of these apps still lack AI in those workflows. Bebo's provider-choice assistant and community planning workflow are a prototype response to that gap. Do not attach a statistic or claim broader measured impact without a source. For the final entry, add one brief, non-identifying example of the affected users and the task they cannot get AI help with, if available; do not invent interviews, data, or impact claims.

## What this repository can claim

The Bebo foundation predates the event window: the workspace contains source files dated September 19 and September 28, 2026. Do not claim the entire application was built during Neighborhood Hacks. The community workflow added for this event is the new contribution. The builder confirms eligibility and organizer clearance to reuse the project foundation; no private details or correspondence are included here. The [event rules](https://neighborhood-hacks-2026.devpost.com/rules) require project code, designs, and content to be created during October 16–23, 2026.

## Build and disclosure notes

- AI coding assistant used: OpenAI Codex.
- Main application stack: TypeScript, Lit, Vite, and Vitest.
- Host integration: Office.js for Excel; user-configured AI provider endpoints for model calls.
- The demo submission must name the specific provider/model actually used in its recording. This repository does not contain provider credentials.
- The provider connection check sends a fixed, short prompt and does not include workbook data or conversation history; hosted models may charge for that request.
- Do not commit API keys, access tokens, private contact details, names, exact home addresses, or private community records.

## Submission checklist

- Eligibility and reuse clearance are confirmed by the builder; no eligibility details belong in this repository.
- Refine the local problem entry with one concrete, non-identifying example, if available.
- Describe what Bebo does, the stack/APIs, challenges, and next steps.
- Record a 2–6 minute demo that shows the community workflow working.
- Provide a public repository link only after reviewing the repository for credentials and private information.
- The deadline shown on Devpost is October 24 at 12:00 a.m. CDT; use that earlier displayed deadline and verify the event page's timezone before submission.

Nothing in this file is a Devpost submission. No personal or eligibility information should be added here.
