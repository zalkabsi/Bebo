# Neighborhood Hacks 2026 — Bebo Community Access

## Project name

Bebo Community Access

## Elevator pitch

Bebo is a provider-choice AI assistant for office work, including local models. Its community workflow helps turn verified observations into an action plan and accessible updates, without adding personal details to the tracker.

## What problem are you solving, and how do you know it is real?

I have observed that many people do not have access to Microsoft products. Newer office apps give people another way to work with documents and spreadsheets, but those users still lack AI support in the tools they can access. This leaves people without the AI help they want in their everyday office workflow.

This problem statement is based on my observation, not a formal survey. I have not measured how many people are affected, so this submission makes no numerical or impact claim.

## What does Bebo do, and how does it work?

Bebo lets a user choose an AI provider for office tasks. The provider list includes hosted options, OpenAI-compatible endpoints, and Ollama for users who have a local model installed. Bebo provides community-focused chat starters to plan a project from verified facts, draft a plain-language update, and create a blank Excel action tracker.

The tracker creates a new sheet instead of replacing existing workbook content. It uses volunteer roles instead of names and includes fields for actions, status, target dates, public evidence, impact measures, and privacy-conscious progress updates. Creating the sheet requires user confirmation. The assistant is instructed to distinguish observations from assumptions and not invent local facts, people, or outcomes.

The current prototype demonstrates this workflow with Excel. WordCraft, GridCraft, and DeckCraft connections use a local MCP companion; chat panels installed directly inside those apps are a next step. The current companion setup still requires running Bebo locally.

## How was it built?

Bebo uses TypeScript, Lit, and Vite. Its Excel integration uses Office.js, and the browser development mode includes an in-memory workbook for trying the interface. The agent calls registered workbook tools through a permission layer. Provider adapters support OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and custom OpenAI Chat Completions-compatible endpoints.

Provider keys are stored in the browser client and sent to the selected provider endpoint. A provider connection check sends only a fixed generic prompt; it does not include workbook data or chat history. The application does not add telemetry. When using the assistant with office content, the selected provider may receive the relevant content needed to answer the request.

## Challenges

The main engineering challenge is giving different providers a consistent streaming and tool-calling interface while keeping spreadsheet changes reviewable. Bebo uses permission prompts for changes, checkpoints for Excel mutations, and a separate structure confirmation for the community tracker. Another challenge is supporting familiar open office workflows without copying their document APIs into Bebo; Craft app work currently goes through each app's local MCP/control interface.

## What would we do next?

The next steps are to package the local companion so users do not need to run `npm run dev`, add direct chat panels where the Craft apps support them, test provider setup with people who rely on these alternatives, and improve accessibility and localization based on their feedback. We would measure setup completion and whether the community tracker helps groups move from an observed problem to coordinated action before making impact claims.

## Tools and disclosures

- Languages and frameworks: TypeScript, Lit, Vite, and Vitest.
- Integrations: Office.js for Excel; local MCP/control interfaces for the Craft app companion.
- AI providers: OpenAI, Anthropic, Gemini, DeepSeek, Ollama, and configurable OpenAI-compatible endpoints.
- AI coding assistant: OpenAI Codex.
- This event contribution adds the community access workflow to an existing Bebo foundation. The builder confirms reuse clearance with the organizers; the older foundation is not represented as newly created during the event.
