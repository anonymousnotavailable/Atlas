const { googleConfigured, getGoogleAccessToken } = require("../lib/google-auth");

const NOT_CONFIGURED = "Google Calendar isn't connected yet. Prathmesh needs to set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in server/.env (see CONNECTORS.md).";

async function upcomingEvents({ maxResults, daysAhead }) {
  if (!googleConfigured()) return { error: NOT_CONFIGURED };

  const limit = Math.min(15, Math.max(1, parseInt(maxResults, 10) || 5));
  const days = Math.min(30, Math.max(1, parseInt(daysAhead, 10) || 7));
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const token = await getGoogleAccessToken();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=${limit}&singleEvents=true&orderBy=startTime`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || "Calendar request failed." };

    const events = (data.items || []).map((e) => ({
      summary: e.summary || "(no title)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || "",
    }));

    return { events };
  } catch (err) {
    return { error: err.message || "Calendar request failed." };
  }
}

module.exports = [
  {
    toolSchema: {
      name: "calendar_upcoming_events",
      description: "List Prathmesh's upcoming Google Calendar events (read-only), soonest first.",
      input_schema: {
        type: "object",
        properties: {
          maxResults: { type: "integer", description: "Max events to return (1-15). Defaults to 5." },
          daysAhead: { type: "integer", description: "How many days ahead to look (1-30). Defaults to 7." },
        },
      },
    },
    execute: upcomingEvents,
  },
];
