# Atlas backend

Minimal Express server that keeps API keys off the client and serves the
Atlas frontend (`index.html`).

- `POST /api/chat` — builds the system prompt (personality + humour level +
  `../knowledge/*.md`), runs a tool-use agent loop against whichever chat
  provider is configured (`server/providers/` — Gemini or Anthropic), and
  can call any wire in `server/connectors/`.
- `POST /api/speak` — proxies text to ElevenLabs TTS and streams back audio.
  Returns `501` if ElevenLabs isn't configured; the frontend falls back to
  the browser's built-in speech synthesis in that case.
- `GET /api/status` — connected/not-connected state for every wire; backs
  the 🔌 WIRES panel in `index.html`.
- `POST /api/device/location` — the frontend reports phone GPS here so the
  `device_location` tool can use it.

See `../CONNECTORS.md` for what each wire in `server/connectors/` needs.

## Run locally

**Windows:** install [Node.js LTS](https://nodejs.org) if you haven't, then
double-click `start.bat` in this folder. First run creates `.env` from
`.env.example` and opens it in Notepad for you to paste your keys into —
save and close Notepad to continue. It installs dependencies and starts the
server automatically; keep the window open while using Atlas.

**macOS/Linux:**
```bash
cd server
cp .env.example .env   # fill in GEMINI_API_KEY (free) or ANTHROPIC_API_KEY at minimum
npm install
npm start
```

Either way, open `http://localhost:8787` in a browser **on the same
machine** — it serves `index.html` directly, so no separate frontend
server is needed.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | One of these two | Powers chat via Google Gemini — free tier, no card required. Preferred automatically if set. |
| `ANTHROPIC_API_KEY` | One of these two | Powers chat via Claude — paid, higher quality. |
| `CHAT_PROVIDER` | No | Set to `gemini` or `anthropic` to force one when both keys are present. Auto-detects otherwise. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | No | Enables higher-quality TTS. Without both, Atlas uses the browser's Web Speech API instead. |
