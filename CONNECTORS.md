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

**Already authorized before?** The script now requests three scopes —
`gmail.readonly`, `gmail.compose` (draft creation), and full `calendar`
(event creation), up from just the two readonly scopes. A refresh token
minted before this change only carries the old scopes, so
`gmail_create_draft` and `calendar_create_event` will fail with an
"insufficient permission" error (which Atlas will surface plainly, with
this same instruction) until you re-run the script and re-authorize —
Google's consent screen will show the two new permissions being requested.

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

## Web search

`web_fetch` only works on a URL you already have — `web_search` is the
open-ended "look this up" capability, so Atlas can answer things it isn't
confident about instead of guessing.

- `TAVILY_API_KEY` — [tavily.com](https://app.tavily.com), sign up with
  email → the dashboard shows your API key immediately. Free tier is 1,000
  searches/month, **no card required** (this was built specifically for AI
  agents doing exactly this, unlike general search APIs that gate the free
  tier behind card verification).
- Without it, Atlas will say plainly that search isn't connected and fall
  back to `web_fetch` if you give it a specific URL — nothing crashes.

## Morning briefing (push notifications)

No account, no card, no API key — this uses standard Web Push (the same
browser-native mechanism every site's "Allow notifications?" prompt uses),
not Firebase Cloud Messaging, so there's no third-party project to set up.
The one "credential" it needs — a VAPID keypair — is generated by the
server itself on first boot and saved to `server/data/vapid-keys.json`
(gitignored, stays stable across restarts).

**To turn it on:** type `/briefing` in Atlas (or run "Enable Morning
Briefing" from the command palette) and accept the browser's notification
permission prompt. `/briefingtest` sends one immediately, without waiting
for the schedule — use it to confirm everything's wired before trusting
the daily one. `/briefingoff` unsubscribes.

**Configure in `server/.env`:**
- `BRIEFING_HOUR` — hour of day (0-23) it fires. Defaults to 7.
- `BRIEFING_TIMEZONE` — an IANA timezone name (e.g. `Asia/Kolkata`), not an
  offset. Defaults to `UTC` — if you leave this unset on a server that
  isn't itself in UTC (which Render's servers are), the briefing will fire
  at 7am UTC, not 7am wherever you are. Set it explicitly.
- `VAPID_SUBJECT` — a contact address the push services can use if there's
  ever a problem with your key. Not shown to anyone, just required by the
  Web Push spec. Any `mailto:` address works.

**What it actually sends:** 2-3 plain sentences in Atlas's own voice,
built from whatever's really connected — today's calendar events, unread
mail from the last day, anything remembered about you — written fresh by
the chat provider each morning, not a template. If Calendar/Gmail aren't
connected, it just skips those parts instead of complaining.

**Honest limitation:** this only fires while the server process is
actually running. Render's free tier spins the process down after ~15
minutes idle and only wakes it on an incoming request — if it happens to
be asleep at `BRIEFING_HOUR`, that day's briefing is silently missed, no
error, nothing retried. Two ways around it: upgrade to a Render plan that
doesn't sleep, or point a free external pinger (e.g. UptimeRobot,
cron-job.org) at `GET /api/status` every 10 minutes to keep it awake —
same fix people use for any free-tier "spins down when idle" host.

## File generation

No credential needed — when Prathmesh asks Atlas to write something
substantial (a script, a config, a small document), Atlas can hand it back
as a real downloadable file via `create_artifact` instead of just pasting
code into the chat. Kept in server memory for 6 hours (long enough to
notice and download, capped at 50 at a time) — download it promptly, it's
not archived anywhere.

## Memory

No credential needed — Atlas can save/recall/forget facts about you across
conversations via `server/data/memory.json` (gitignored, local disk).
Free-tier hosting (Render) wipes disk on redeploy/restart, so treat this as
durable within a deployment, not permanently forever.

## Prism (data analysis)

Prism (the separate Auto-EDA project) exposes a small API — `prism/api/` in
that repo — that Atlas calls into so you can upload a CSV/Excel file via the
📊 button and ask Atlas to query, profile, or chart it.

1. Deploy `prism/api/` as its own web service (see that repo's
   `render.yaml`, or run locally: `cd prism/api && pip install -r
   requirements.txt && uvicorn main:app --host 0.0.0.0 --port 8000`).
2. Set `PRISM_API_URL` in `server/.env` to that service's URL (e.g.
   `http://localhost:8000` locally, or its Render URL once deployed).

Datasets live in the Prism API's memory only — nothing is written to disk,
and a server restart means re-uploading. Only one dataset is "active" at a
time, matching how Prism's own Streamlit app works.
