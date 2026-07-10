# Atlas backend

Minimal Express server that keeps API keys off the client and serves the
Atlas frontend (`index.html`).

- `POST /api/chat` — builds the system prompt (personality + humour level +
  `../knowledge/*.md`), runs a tool-use agent loop against the Anthropic
  Messages API, and can call any wire in `server/connectors/`.
- `POST /api/speak` — proxies text to ElevenLabs TTS and streams back audio.
  Returns `501` if ElevenLabs isn't configured; the frontend falls back to
  the browser's built-in speech synthesis in that case.
- `GET /api/status` — connected/not-connected state for every wire; backs
  the 🔌 WIRES panel in `index.html`.
- `POST /api/device/location` — the frontend reports phone GPS here so the
  `device_location` tool can use it.

See `../CONNECTORS.md` for what each wire in `server/connectors/` needs.

## Run locally

```bash
cd server
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
npm install
npm start
```

Open `http://localhost:8787` — it serves `index.html` directly, so no
separate frontend server is needed.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Powers all chat responses. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-4-6`. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | No | Enables higher-quality TTS. Without both, Atlas uses the browser's Web Speech API instead. |
