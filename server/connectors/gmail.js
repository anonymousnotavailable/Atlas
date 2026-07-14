const { googleConfigured, getGoogleAccessToken } = require("../lib/google-auth");

const NOT_CONFIGURED = "Gmail isn't connected yet. Prathmesh needs to set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in server/.env (see CONNECTORS.md).";

function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

async function gmailSearch({ query, maxResults }) {
  if (!googleConfigured()) return { error: NOT_CONFIGURED };

  const q = query || "is:unread";
  const limit = Math.min(10, Math.max(1, parseInt(maxResults, 10) || 5));

  try {
    const token = await getGoogleAccessToken();
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listRes.json();
    if (!listRes.ok) return { error: listData.error?.message || "Gmail search failed." };

    const ids = (listData.messages || []).map((m) => m.id);
    if (ids.length === 0) return { results: [], note: `No messages matched "${q}".` };

    const messages = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = await r.json();
        return {
          from: headerValue(d.payload?.headers, "From"),
          subject: headerValue(d.payload?.headers, "Subject"),
          date: headerValue(d.payload?.headers, "Date"),
          snippet: d.snippet || "",
        };
      })
    );

    return { results: messages };
  } catch (err) {
    return { error: err.message || "Gmail request failed." };
  }
}

module.exports = [
  {
    toolSchema: {
      name: "gmail_search",
      description:
        "Search Prathmesh's Gmail inbox (read-only) using Gmail search syntax (e.g. 'is:unread', 'from:someone@example.com', 'newer_than:1d'). Returns sender, subject, date, and a snippet for each match.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query. Defaults to 'is:unread'." },
          maxResults: { type: "integer", description: "Max messages to return (1-10). Defaults to 5." },
        },
      },
    },
    execute: gmailSearch,
  },
];
