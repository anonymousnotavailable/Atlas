# Atlas Connectors — credential checklist

Every connector below degrades gracefully: if its env vars aren't set in
`server/.env`, Atlas will tell you conversationally what's missing instead of
crashing or silently failing. Add credentials in whatever order you get them
— nothing needs to be done first except a chat provider (Gemini or Anthropic).

Tap the **🔌 WIRES** chip in the Atlas header (or hit `GET /api/status`
directly) for a live, single-place view of what's currently wired up.

## Honest scope note

This is a web app (browser + Node backend). It can call any cloud API you
give it a credential for. It **cannot** reach into Android/iOS itself — no
reading SMS, no making calls, no reading contacts/photos/notifications, no
controlling other apps. The one real "device" signal it can get is GPS
location, because that's a standard browser permission your phone will
prompt for when you open the page (already wired — see "Device location"
below). If you want deeper OS-level control later, that requires a native
app or an automation bridge (e.g. Tasker + HTTP webhooks into this server),
not a web page.

---

## Chat — pick one (required)

Atlas needs exactly one of these. If both are set, `CHAT_PROVIDER` picks
which one wins; otherwise Gemini is preferred automatically since it's free.

**Gemini (free, no card required — recommended if you don't want to pay):**
- Go to [Google AI Studio](https://aistudio.google.com/apikey) → sign in →
  **Create API key** → copy it → `GEMINI_API_KEY`.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`. If Atlas errors with a
  "model not found"-type message, open AI Studio and check the current
  free-tier model name, then set `GEMINI_MODEL` to match — Google renames/
  retires model versions over time.
- Free tier has rate limits (requests per minute/day) generous enough for
  personal use, but not unlimited — if Atlas suddenly stops responding, you
  may have hit the daily quota; it resets the next day.

**Anthropic (paid, higher quality):**
- `ANTHROPIC_API_KEY` — from the [Anthropic Console](https://console.anthropic.com),
  requires adding billing under Plans & Billing.

## ElevenLabs (voice)

- `ELEVENLABS_API_KEY` — ElevenLabs dashboard → Profile → API Keys.
- `ELEVENLABS_VOICE_ID` — pick a British-sounding voice from the ElevenLabs
  Voice Library (e.g. search "British") and copy its Voice ID.

## Gmail + Google Calendar (shared credentials)

Both connectors use one OAuth client since they hit the same Google account.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   a project (or reuse one) → **APIs & Services → Library** → enable
   **Gmail API** and **Google Calendar API**.
2. **APIs & Services → OAuth consent screen → Audience** — set it to
   "External" + "Testing", then add your own Google account under **Test
   users**. Skipping this causes "Access blocked" when authorizing below.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Desktop app**. Unlike "Web application" clients,
   Desktop app clients don't need a redirect URI registered at all — Google
   exempts loopback addresses (`127.0.0.1`) from that requirement, which
   avoids the fiddly, typo-prone "redirect_uri_mismatch" errors the OAuth
   Playground method is prone to. This gives you `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.
4. Put those two values in `server/.env`, then run the helper script once,
   on the same machine/device as the browser you'll sign in with:
   ```bash
   cd server
   node scripts/get-google-refresh-token.js
   ```
   It prints a Google sign-in URL — open it, sign in with the account added
   as a test user in step 2, approve access, then return to the terminal.
   The script catches the redirect on `127.0.0.1`, exchanges it for a
   refresh token, and writes `GOOGLE_REFRESH_TOKEN` into `server/.env`
   automatically.

## Device location

No credential needed — when you open Atlas on your phone, the browser will
prompt for location permission. Grant it once and Atlas can answer
location-aware questions ("what's near me", "what's the weather here").
Refreshes automatically every 15 minutes while the page is open. Denying
the prompt just means Atlas has no location context — nothing breaks.

## Browser control / web lookups

`web_fetch` is already live, no credential required — Atlas can pull the
text content of any URL you give it (read-only, no clicking/login). Full
interactive browser control (clicking, filling forms, logging in as you)
is a separate, higher-effort piece — see PLAN.md row 3 — and intentionally
wasn't wired up unattended given the blast radius of an agent driving a
real browser session under your identity.
