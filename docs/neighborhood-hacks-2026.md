# Neighborhood Hacks 2026 notes

## Project framing

**Working name:** Bebo Community Access

**Draft pitch:** Bebo helps community groups use AI in familiar office tools with a provider they choose, including local models. Community quick starts help turn verified, non-identifying observations into an action tracker and accessible updates.

The builder's stated motivation is that people should be able to access AI in the newer productivity tools they use. This is a useful direction, but the hackathon asks for a specific local problem and evidence. Before submission, add one concrete, non-identifying example from the builder's community or cite a public source. Do not invent interviews, data, or impact claims.

## What this repository can claim

The Bebo foundation predates the event window: the workspace contains source files dated September 19 and September 28, 2026. Do not claim the entire application was built during Neighborhood Hacks. The community workflow added for this event is the new contribution; ask the organizers whether reusing this existing project foundation is acceptable before submitting. The [event rules](https://neighborhood-hacks-2026.devpost.com/rules) require project code, designs, and content to be created during October 16–23, 2026.

## Build and disclosure notes

- AI coding assistant used: OpenAI Codex.
- Main application stack: TypeScript, Lit, Vite, and Vitest.
- Host integration: Office.js for Excel; user-configured AI provider endpoints for model calls.
- The demo submission must name the specific provider/model actually used in its recording. This repository does not contain provider credentials.
- The provider connection check sends a fixed, short prompt and does not include workbook data or conversation history; hosted models may charge for that request.
- Do not commit API keys, access tokens, private contact details, names, exact home addresses, or private community records.

## Submission checklist

- Confirm the event's high-school and age eligibility requirements privately; no eligibility details belong in this repository.
- Confirm the reuse question with the organizers because the Bebo foundation is older than the event window.
- Add the specific local problem and its non-identifying evidence.
- Describe what Bebo does, the stack/APIs, challenges, and next steps.
- Record a 2–6 minute demo that shows the community workflow working.
- Provide a public repository link only after reviewing the repository for credentials and private information.
- The deadline shown on Devpost is October 24 at 12:00 a.m. CDT; use that earlier displayed deadline and verify the event page's timezone before submission.

Nothing in this file is a Devpost submission. No personal or eligibility information should be added here.
