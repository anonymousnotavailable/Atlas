# ATLAS → Jarvis Dashboard: Implementation Plan

> **Status:** Rows 0, 2, 4, 5, 6, 7, 8, 9 are wired up in code (`server/`,
> `CONNECTORS.md`) and just need real credentials dropped into
> `server/.env` — see `CONNECTORS.md` for exactly what to get. Row 3 has a
> read-only `web_fetch` tool but not full interactive browser control.
> Rows 1, 10, 11 are still open.

Atlas today is a single-page chat UI (`index.html`) with browser-native STT/TTS
and a direct client-side call to the Anthropic Messages API. Everything below
maps the 11-capability wishlist onto concrete next steps for *this* codebase,
in the order that unblocks the most later work.

## 0. Foundational blocker: Atlas needs a backend

Rows 4–11 all require holding API keys (RevenueCat, Buffer/Postiz, Meta,
Gmail, ElevenLabs) and running scheduled/server-side jobs. None of that is
safe or possible from a static `index.html` calling `api.anthropic.com`
directly from the browser (today's `fetch` in `sendMessage()` has no
`x-api-key` header and would expose one in devtools if added — it currently
only works via a proxy or will fail CORS in production).

**Action:** stand up a minimal backend (a Claude Agent SDK process, or a thin
Node/Python API) that Atlas's frontend talks to instead of calling Anthropic
directly. This becomes the home for the MCP connectors in rows 4–9 and the
cron/subagent work in rows 10–11. Everything else in this plan assumes this
exists.

## 1. Dashboard visual (screenshot → Claude Code)

Already effectively done: `index.html` is the dashboard shell (HUD chips,
status states, avatar). Next increment is adding dashboard *widgets* (revenue
tile, social stats, inbox summary) once rows 4–8 produce data to show —
revisit this after row 0.

## 2. Voice in/out with a Jarvis (British) voice

- **STT** — already implemented via `webkitSpeechRecognition` (`startListening`).
- **TTS** — already implemented via `speechSynthesis`, with a UK-male voice
  preference (`speak()`), but browser TTS is low-quality and voice
  availability is inconsistent across devices/browsers.
- **Action:** swap `speak()` for an ElevenLabs TTS call (through the row-0
  backend, so the API key never touches the client) using a British voice
  ID. Keep the current Web Speech API as an offline/no-key fallback.
- **Action:** add a `/voice`-equivalent path — a way to talk *to* Atlas
  hands-free continuously (wake-word or push-to-talk loop) rather than the
  current tap-mic-per-utterance flow.

## 3. Browser control

Not started. Once row 0's backend exists, add a Playwright MCP (or Claude for
Chrome, if Atlas ever runs as a companion to a desktop session) connector so
Atlas can act on `prathmesh`'s behalf — e.g. checking a dashboard, filling a
form. Gate this behind explicit user confirmation per action given the blast
radius of an agent driving a real browser session.

## 4. Revenue tracking (RevenueCat)

Add a RevenueCat MCP connector on the backend. Expose a `getRevenueSummary`
tool Atlas can call mid-conversation, and surface a revenue tile in the
dashboard UI once data flows (see row 1).

## 5. Auto-post content (Buffer or Postiz)

Add a Buffer MCP (or Postiz MCP as the alternative) connector. Start with a
manual "draft a post, ask before publishing" flow before enabling autonomous
posting — this is a shared-visibility action and should require confirmation
per the same bar as any other public-facing action.

## 6. Instagram analytics

Register a Meta developer app, generate a long-lived token, and hand it to
the backend (never the client). Expose an `getInstagramInsights` tool.

## 7. Read + run ads (Meta Ads)

Add the Meta Ads connector once row 6's Meta app/token plumbing exists (they
share the same Meta developer app). Treat "run ads" (spend-affecting) as a
confirm-before-execute action, same tier as a push/deploy.

## 8. Read inbox (Gmail)

Add a Gmail MCP connector (or Google Workspace CLI as the alternative) on the
backend, scoped read-only to start. Summarization surfaces in the dashboard
and in conversation ("what's in my inbox today").

## 9. Answer customers in Atlas's voice (knowledge base)

Create a `knowledge/` directory of markdown files (product docs, FAQs, tone
guide) that the backend's system prompt/RAG layer pulls from — this extends
the existing `buildSystemPrompt()` pattern in `index.html`, which already
encodes personality and known facts about Prathmesh inline. Move that
knowledge out of the hardcoded prompt string and into `knowledge/*.md` so it
can grow without editing the HTML.

## 10. Specialized subagents

Once multiple connectors exist (rows 4–9), split them behind subagents (e.g.
a "growth" agent for rows 5–7, an "ops" agent for rows 4/8) so Atlas's main
loop delegates instead of holding every tool directly. Mirrors this repo's
own use of specialized agents.

## 11. Scheduled runs (Routines)

Once rows 4–9 exist, add scheduled Routines for the recurring checks —
morning revenue/inbox/analytics summary before Prathmesh wakes up, queued
posts publishing on schedule. This is the capstone step; it depends on
everything above already existing.

## Suggested build order

1. Row 0 (backend) — unblocks everything else
2. Row 2 (ElevenLabs voice) — highest-visible upgrade to the existing UI
3. Row 9 (knowledge base) — cheap, improves every conversation immediately
4. Rows 4, 6, 8 (read-only data connectors: revenue, Instagram, Gmail)
5. Row 1 (dashboard widgets) — now there's data to show
6. Rows 5, 7 (write-capable connectors: posting, ads) — gated behind confirmation
7. Row 3 (browser control) — highest blast radius, do last and gated
8. Row 10 (subagents) — refactor once there are enough tools to split
9. Row 11 (Routines) — automate once the above is trustworthy unattended
