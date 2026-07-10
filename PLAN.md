# ATLAS: Implementation Plan

> **Scope note:** Revenue tracking (RevenueCat), social auto-posting
> (Buffer), and Instagram/Meta Ads were removed at Prathmesh's request —
> Atlas is a personal AI with a unified set of web wires, not a marketing
> dashboard. If any of those are wanted back later, their connector modules
> followed the same pattern as the ones still in `server/connectors/` and
> can be re-added the same way.

Atlas is a single-page chat UI (`index.html`) with browser-native STT and a
Node backend (`server/`) that holds API keys server-side and exposes
connected services as tools the chat loop can call. The **🔌 WIRES** panel in
the header is the one place to see everything that's connected.

## Current state

- **Backend** (`server/server.js`) — Express server, tool-use agent loop
  against a swappable chat provider (`server/providers/` — Gemini free
  tier or Anthropic, auto-selected from whichever key is set), serves
  `index.html` directly.
- **Voice** — ElevenLabs TTS through the backend, falls back to the
  browser's Web Speech API if unconfigured. STT via `webkitSpeechRecognition`.
- **Knowledge base** (`knowledge/*.md`) — personal context folded into the
  system prompt, editable without touching code.
- **Wires** (`server/connectors/`) — each is a self-contained module with a
  tool schema + `execute()`; unconfigured ones return a clear "here's what's
  missing" message instead of failing silently:
  - `gmail.js` — read-only Gmail search
  - `calendar.js` — read-only upcoming Google Calendar events
  - `webfetch.js` — no-credential URL lookups
  - `device.js` — phone GPS location, reported by the browser
- **Wires panel** — `GET /api/status` + a header chip in `index.html` show
  connected/not-connected for every wire above in one place.

See `CONNECTORS.md` for exactly which credential to get for each wire and
where to get it.

## Open items

- **Gmail + Calendar refresh token — parked.** `GOOGLE_CLIENT_ID` is saved;
  the refresh token isn't. The OAuth Playground route repeatedly hit
  `Error 400: redirect_uri_mismatch` across multiple attempts and multiple
  OAuth clients — likely a Cloud Console redirect URI config issue that
  wasn't worth further live debugging. `server/scripts/get-google-refresh-token.js`
  is a standalone, dependency-free alternative that sidesteps the problem
  entirely (uses a "Desktop app" OAuth client, which Google exempts from
  redirect URI registration) — pick this connector back up by running that
  script locally, not the Playground. Everything else (chat, voice, web
  lookups, device location) works independently of this.
- **Browser control** — `web_fetch` is read-only lookups only. Full
  interactive control (clicking, filling forms, logging in as Prathmesh) is
  a separate, higher-effort piece, gated behind explicit confirmation per
  action given the blast radius of an agent driving a real browser session
  under his identity. Not started.
- **Dashboard widgets** — the header currently shows wire status as a list;
  richer tiles (e.g. next calendar event, unread count) could render
  directly in the chat header once there's a reason to glance at them
  without asking.
- **Specialized subagents** — once there are enough wires to justify it,
  split them behind subagents (e.g. an "inbox" agent for Gmail/Calendar)
  so the main loop delegates instead of holding every tool directly.
- **Scheduled runs (Routines)** — a morning summary (inbox + calendar)
  before Prathmesh wakes up, once the underlying wires are trustworthy
  unattended.
