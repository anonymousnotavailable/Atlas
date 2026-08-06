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

// Builds an RFC 2822 message and base64url-encodes it the way the Gmail API
// requires for drafts.create's `raw` field.
function buildRawEmail({ to, subject, body }) {
  const message = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', "", body].join(
    "\r\n"
  );
  return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function scopeHint(res, data, scopeName) {
  const msg = data.error?.message || "Gmail request failed.";
  if (res.status === 403 || /insufficient/i.test(msg)) {
    return (
      `${msg} — this needs the ${scopeName} OAuth scope, which wasn't granted the last time Prathmesh ` +
      "authorized. He needs to re-run server/scripts/get-google-refresh-token.js and re-authorize to add it."
    );
  }
  return msg;
}

async function gmailCreateDraft({ to, subject, body }) {
  if (!googleConfigured()) return { error: NOT_CONFIGURED };
  if (!to || !subject || !body) return { error: "to, subject, and body are all required." };

  try {
    const token = await getGoogleAccessToken();
    const raw = buildRawEmail({ to, subject, body });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw } }),
    });
    const data = await res.json();
    if (!res.ok) return { error: scopeHint(res, data, "gmail.compose") };

    return {
      draftCreated: true,
      draftId: data.id,
      to,
      subject,
      note: "Saved as a draft in Gmail — NOT sent. Prathmesh needs to open Gmail and send it himself.",
    };
  } catch (err) {
    return { error: err.message || "Gmail draft creation failed." };
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
  {
    toolSchema: {
      name: "gmail_create_draft",
      description:
        "Create a draft email in Prathmesh's Gmail — saved as a draft, NEVER sent automatically. Use this whenever " +
        "Prathmesh asks you to write, draft, or reply to an email. Confirm the recipient and the gist of what he wants " +
        "said before calling this if it wasn't already unambiguous in his request — then he reviews and sends it " +
        "himself from Gmail. There is no separate 'send email' capability by design.",
      input_schema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string", description: "Email subject line." },
          body: { type: "string", description: "Plain-text email body." },
        },
        required: ["to", "subject", "body"],
      },
    },
    execute: gmailCreateDraft,
  },
];
