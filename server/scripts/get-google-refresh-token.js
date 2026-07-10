// One-time helper: mints a Google OAuth refresh token for Gmail + Calendar
// without needing to register a redirect URI in the Cloud Console.
//
// Why: Google exempts "Desktop app" OAuth clients from redirect URI
// pre-registration for loopback addresses (127.0.0.1) per RFC 8252 — this
// is what avoids the "redirect_uri_mismatch" error you get with the
// OAuth Playground / "Web application" clients.
//
// Requirements:
//   1. A Google Cloud OAuth client of type "Desktop app" (Cloud Console →
//      Credentials → Create Credentials → OAuth client ID → Desktop app).
//      No redirect URI setup needed for this type.
//   2. Your Google account added as a test user (Cloud Console → OAuth
//      consent screen → Audience → Test users), if the app is unpublished.
//   3. Run this ON THE SAME MACHINE as the browser you'll sign in with —
//      it briefly listens on 127.0.0.1 to catch Google's redirect. Running
//      it inside a remote/cloud session won't work if you're signing in
//      from your phone or a different computer.
//
// Usage:
//   cd server
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-refresh-token.js
//   (or put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in server/.env first — this
//   script loads that file automatically)

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (in server/.env or as env vars).");
  console.error("These must come from a 'Desktop app' type OAuth client — see CONNECTORS.md.");
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPES,
  access_type: "offline",
  prompt: "consent",
})}`;

console.log("\n1. Open this URL in a browser on THIS machine and sign in with the Google account you want Atlas to use:\n");
console.log(authUrl);
console.log(`\n2. Waiting for Google to redirect back to ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.end(`Google returned an error: ${error}. Check the terminal and try again.`);
    console.error(`\nGoogle returned an error: ${error}`);
    server.close();
    process.exit(1);
    return;
  }

  if (!code) {
    res.end("No authorization code received — check the terminal.");
    return;
  }

  res.end("Success — you can close this tab and go back to the terminal.");
  server.close();

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error("\nToken exchange failed:", tokenData);
      process.exit(1);
    }

    console.log("\n✅ Refresh token obtained:\n");
    console.log(tokenData.refresh_token);

    const envPath = path.join(__dirname, "..", ".env");
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    if (/^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)) {
      env = env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${tokenData.refresh_token}`);
    } else {
      env += `${env.endsWith("\n") || env === "" ? "" : "\n"}GOOGLE_REFRESH_TOKEN=${tokenData.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, env);
    console.log("\nWritten to server/.env — restart the server (npm start) and Gmail + Calendar are live.\n");
  } catch (err) {
    console.error("\nToken exchange request failed:", err.message);
  }

  process.exit(0);
});

server.listen(PORT, "127.0.0.1");
