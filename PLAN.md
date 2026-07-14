# ATLAS: Implementation Plan

> **Scope note:** Revenue tracking (RevenueCat), social auto-posting
> (Buffer), and Instagram/Meta Ads were removed at Prathmesh's request —
> Atlas is a personal AI with a unified set of web wires, not a marketing
> dashboard.

Atlas is a single-page chat UI (`index.html`) with browser-native STT and a
Node backend (`server/`) that holds API keys server-side and exposes
connected services as tools the chat loop can call. The **🔌 WIRES** panel in
the header is the one place to see everything that's connected.

## Current state

- **Backend** (`server/server.js`) — Express server, streaming (SSE-derived
  NDJSON) tool-use agent loop against a swappable chat provider
  (`server/providers/` — Gemini free tier or Anthropic, auto-selected from
  whichever key is set), serves `index.html` directly.
- **Voice** — ElevenLabs TTS through the backend, falls back to the
  browser's Web Speech API if unconfigured. STT via `webkitSpeechRecognition`.
  **Hands-free conversation mode** (🎧 CONVO chip) loops listen → auto-send →
  speak → auto-listen continuously; say "stop conversation" to exit.
- **Streaming replies** — text appears token-by-token as the model generates
  it, not all at once. Chart images stream to the client out-of-band (never
  through the model's own text context).
- **PWA** — installable to the home screen (`manifest.json`, `sw.js`,
  `icon.svg`), opens fullscreen like a native app.
- **Persistent chat history** — survives page reloads via `localStorage`;
  say "clear chat" to reset. Images are stripped before persisting.
- **Vision** — attach a photo/screenshot via 📷; Atlas actually sees it
  (Gemini/Anthropic multimodal), not just a filename.
- **Long-term memory** — Atlas saves/recalls/forgets facts about Prathmesh
  across sessions (`remember_fact`/`recall_facts`/`forget_fact`), injected
  into every system prompt automatically.
- **Knowledge base** (`knowledge/*.md`) — personal context folded into the
  system prompt, editable without touching code.
- **Wires** (`server/connectors/`) — each is a self-contained module with a
  tool schema + `execute()`; unconfigured ones return a clear "here's what's
  missing" message instead of failing silently:
  - `gmail.js` — read-only Gmail search
  - `calendar.js` — read-only upcoming Google Calendar events
  - `webfetch.js` — no-credential URL lookups
  - `device.js` — phone GPS location, reported by the browser
  - `memory.js` — long-term facts (see above)
  - `prism.js` — data analysis (see below)
- **Prism integration** — upload a CSV/Excel via 📊 and ask Atlas about it
  directly: `dataset_summary`/`profile_dataset`/`query_dataset` (real SQL via
  DuckDB)/`chart_dataset` (real PNG charts). Calls out to a separate Prism
  API service (`prism/api/main.py` in the Prism repo — a FastAPI wrapper
  around Prism's existing `modules/`, deployed independently). Only one
  dataset "active" at a time, matching Prism's own Streamlit app.
- **Wires panel** — `GET /api/status` + a header chip in `index.html` show
  connected/not-connected for every wire above in one place.

See `CONNECTORS.md` for exactly which credential to get for each wire and
where to get it.

## Open items

- **Gmail + Calendar refresh token — parked.** `GOOGLE_CLIENT_ID`/`SECRET`
  are saved; the refresh token isn't. The OAuth Playground route repeatedly
  hit `Error 400: redirect_uri_mismatch`. `server/scripts/get-google-refresh-token.js`
  is a standalone alternative that sidesteps the problem entirely (uses a
  "Desktop app" OAuth client, exempt from redirect URI registration) — pick
  this back up by running that script locally, not the Playground.
- **Browser control** — `web_fetch` is read-only lookups only. Full
  interactive control (clicking, filling forms, logging in as Prathmesh) is
  a separate, higher-effort piece, gated behind explicit confirmation per
  action given the blast radius of an agent driving a real browser session
  under his identity. Not started.
- **Anthropic streaming** — implemented and unit/mock-verified (real SSE
  event parsing, not simulated), but never confirmed against the live API
  since there's no billing on that account — only Gemini has been
  live-verified end-to-end.
- **Live end-to-end verification gap** — the Gemini free tier's daily quota
  was exhausted by this session's own extensive testing. The SSE streaming
  fix, vision, and Prism-tool-calling were verified as thoroughly as
  possible without live calls (mocked-fetch request-shape checks, a real
  live capture of Gemini's actual wire format for the streaming bug
  specifically, and full headless-browser client-flow tests with the
  network intercepted) — but a final live "does the whole loop work
  together against the real API right now" pass is still worth doing once
  quota resets (next day) or Anthropic billing is added.
- **Dashboard widgets** — the header currently shows wire status as a list;
  richer tiles (e.g. next calendar event, unread count) could render
  directly in the chat header once there's a reason to glance at them
  without asking.
- **Specialized subagents** — once there are enough wires to justify it,
  split them behind subagents (e.g. an "inbox" agent for Gmail/Calendar, a
  "data" agent for Prism) so the main loop delegates instead of holding
  every tool directly.
- **Scheduled runs (Routines)** — a morning summary (inbox + calendar +
  dataset refresh) before Prathmesh wakes up, once the underlying wires are
  trustworthy unattended.
