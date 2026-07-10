# Atlas Connectors — credential checklist

Every connector below degrades gracefully: if its env vars aren't set in
`server/.env`, Atlas will tell you conversationally what's missing instead of
crashing or silently failing. Add credentials in whatever order you get them
— nothing needs to be done first except `ANTHROPIC_API_KEY`.

Check `GET /api/status` on the running server for a live view of what's
currently wired up.

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

## RevenueCat

- [RevenueCat dashboard](https://app.revenuecat.com/) → Project settings →
  API keys → create a **Secret API key** (v2, read access is enough) →
  `REVENUECAT_API_KEY`.
- `REVENUECAT_PROJECT_ID` is shown in the same Project settings page.

## Buffer

- [Buffer Developer Apps](https://buffer.com/developers/apps) → create an
  app → your **Access Token** is shown on the app's page → `BUFFER_ACCESS_TOKEN`.
- Atlas only ever queues posts (`now=false`) — they land in your Buffer
  queue for you to approve, never publish instantly.

## Meta (Instagram Insights + Ads)

1. [Meta for Developers](https://developers.facebook.com/) → create an app
   (type: Business).
2. Add the **Instagram Graph API** and **Marketing API** products.
3. Under **Tools → Graph API Explorer**, generate a **long-lived User or
   Page access token** with scopes: `instagram_basic`,
   `instagram_manage_insights`, `ads_read`. → `META_ACCESS_TOKEN`.
4. `META_IG_USER_ID` — the Instagram Business Account ID linked to your
   connected Facebook Page (Graph API Explorer: `GET /me/accounts` then
   `GET /{page-id}?fields=instagram_business_account`).
5. `META_AD_ACCOUNT_ID` — from [Ads Manager](https://adsmanager.facebook.com/)
   account settings (numeric ID, without the `act_` prefix — the connector
   adds that itself).

Note: `ads_summary` is deliberately **read-only**. Creating or modifying ad
spend isn't exposed as a tool — that's a confirm-before-execute action per
`PLAN.md`, not something to hand an LLM unattended.

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
