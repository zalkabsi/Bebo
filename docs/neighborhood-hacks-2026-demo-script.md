# Neighborhood Hacks demo narration and shot list

Target runtime: about 3 minutes. The browser preview uses a mock workbook. Do not imply that an Excel edit, live provider call, or Craft app connection happened during this recording. Never display provider keys or personal records.

## 0:00–0:25 — Introduce the access gap

**Show:** Bebo home screen with the community quick starts and the browser preview notice visible.

**Narration:** “Some people I’ve spoken with do not have access to Microsoft products. Newer office apps can give them another place to work, but those apps may not include the AI support they want. Bebo is an open-source companion that brings provider choice and practical community starters into office workflows. This browser preview uses a mock workbook, so I’ll show the setup and prompts without presenting a live workbook change.”

## 0:25–0:50 — Show provider choice

**Show:** Provider selector, then Settings. Keep all credential fields empty.

**Narration:** “Users can choose from the providers shown here, configure an OpenAI-compatible endpoint, or use Ollama when they already have a local model installed. Users bring their own provider access. A local model can avoid hosted API fees, but it still needs compatible software and suitable hardware. No provider is called in this demo.”

## 0:50–1:15 — Start a community plan

**Show:** Click “Plan a community project” and show the prompt in the composer without submitting it.

**Narration:** “The community starter asks what problem the user personally observed, what public or non-identifying evidence supports it, who is affected as a group, and what success would look like. It instructs the assistant to separate observations from assumptions and not invent local facts, interviews, or statistics. People can begin with what they know without entering names or exact addresses.”

## 1:15–1:45 — Prepare an action tracker

**Show:** Click “Create a project tracker,” then show the privacy reminder and the prompt in the composer.

**Narration:** “This starter prepares a request for a community action tracker. In the Excel add-in, the implemented action-board tool creates a new sheet instead of overwriting an existing one and asks the user before changing workbook structure. Its blank template uses volunteer roles rather than names, with fields for actions, status, target dates, public evidence, and progress. I’m showing the request here; this mock workbook is not executing the change.”

## 1:45–2:10 — Show an accessible update starter

**Show:** Click “Draft an accessible update” and show the prompt in the composer.

**Narration:** “The accessible update starter helps turn information the user has verified into a short, plain-language update. It asks who the update is for and which languages are needed. If a fact is missing, it asks for the missing information instead of filling it in. That keeps the user in control of what gets communicated.”

## 2:10–2:35 — Explain provider and privacy choices

**Show:** Provider settings and the community privacy reminder. Never reveal a key.

**Narration:** “The connection check sends a fixed generic prompt, not workbook data or chat history. When someone asks an AI provider to work with office content, the selected provider may receive the content needed to answer. Bebo keeps provider keys in the browser client and does not add telemetry. The starter also reminds users to work with group-level information and public evidence.”

## 2:35–3:00 — Show the Craft companion and close

**Show:** Craft app settings, then the Bebo home screen or an end card.

**Narration:** “Bebo also has a local MCP companion for WordCraft, GridCraft, and DeckCraft. Those connections currently require Bebo to run locally, and the apps do not yet have Bebo chat panels installed inside them. The prototype is Excel first. Next, I want to make setup easier and test these workflows with people who rely on office alternatives, then improve the product from their feedback.”

## Produce the voiceover

On Windows, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/create-demo-audio.ps1` to generate a local WAV narration using the installed Microsoft desktop voice. This keeps the demo script off external speech services and requires no speech API key.
