// Exchanges a long-lived Google OAuth refresh token for a short-lived access
// token, caching it in memory until shortly before it expires. Shared by the
// Gmail and Calendar connectors, which use the same Google OAuth client.

let cachedToken = null;
let cachedExpiry = 0;

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

async function getGoogleAccessToken() {
  if (!googleConfigured()) {
    throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN).");
  }

  if (cachedToken && Date.now() < cachedExpiry - 30000) {
    return cachedToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Failed to refresh Google access token.");
  }

  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

module.exports = { googleConfigured, getGoogleAccessToken };
