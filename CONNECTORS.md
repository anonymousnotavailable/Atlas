# Atlas Connectors — credential checklist

Every connector below degrades gracefully: if its env vars aren't set in
`server/.env`, Atlas will tell you conversationally what's missing instead of
crashing or silently failing. Add credentials in whatever order you get them
— nothing needs to be done first except `ANTHROPIC_API_KEY`.

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

## Anthropic (required)

- `ANTHROPIC_API_KEY` — from the Anthropic Console.

## ElevenLabs (voice)

- `ELEVENLABS_API_KEY` — ElevenLabs dashboard → Profile → API Keys.
- `ELEVENLABS_VOICE_ID` — pick a British-sounding voice from the ElevenLabs
  Voice Library (e.g. search "British") and copy its Voice ID.

## Gmail + Google Calendar (shared credentials)

Both connectors use one OAuth client since they hit the same Google account.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   a project (or reuse one) → **APIs & Services → Library** → enable
   **Gmail API** and **Google Calendar API**.
2. **APIs & Services → OAuth consent screen** — set it up as "External" +
   "Testing", add your own Google account as a test user.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type "Desktop app". This gives you `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.
4. Generate a `GOOGLE_REFRESH_TOKEN` once, locally, using
   [Google's OAuth Playground](https://developers.google.com/oauthplayground/):
   - Gear icon (top right) → check "Use your own OAuth credentials" → paste
     your client ID/secret.
   - Step 1: select scopes `https://www.googleapis.com/auth/gmail.readonly`
     and `https://www.googleapis.com/auth/calendar.readonly` → Authorize.
   - Step 2: click "Exchange authorization code for tokens" → copy the
     **Refresh token** shown.
5. Put all three values in `server/.env`.

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
