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

function scopeHint(res, data) {
  const msg = data.error?.message || "Calendar request failed.";
  if (res.status === 403 || /insufficient/i.test(msg)) {
    return (
      `${msg} — this needs the full Calendar OAuth scope (not just calendar.readonly), which wasn't granted the ` +
      "last time Prathmesh authorized. He needs to re-run server/scripts/get-google-refresh-token.js and " +
      "re-authorize to add it."
    );
  }
  return msg;
}

async function createEvent({ summary, startDateTime, endDateTime, description, location, attendees }) {
  if (!googleConfigured()) return { error: NOT_CONFIGURED };
  if (!summary || !startDateTime || !endDateTime) {
    return { error: "summary, startDateTime, and endDateTime are all required (ISO 8601, e.g. 2026-08-06T15:00:00+05:30)." };
  }

  try {
    const token = await getGoogleAccessToken();
    const attendeeEmails = Array.isArray(attendees) ? attendees.filter(Boolean) : [];
    const eventBody = {
      summary,
      description: description || undefined,
      location: location || undefined,
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
      ...(attendeeEmails.length ? { attendees: attendeeEmails.map((email) => ({ email })) } : {}),
    };

    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    const data = await res.json();
    if (!res.ok) return { error: scopeHint(res, data) };

    return {
      eventCreated: true,
      eventId: data.id,
      htmlLink: data.htmlLink,
      summary,
      start: startDateTime,
      end: endDateTime,
      attendeesInvited: attendeeEmails,
    };
  } catch (err) {
    return { error: err.message || "Calendar event creation failed." };
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
  {
    toolSchema: {
      name: "calendar_create_event",
      description:
        "Create a real event on Prathmesh's Google Calendar. This has a live effect — it appears on his calendar " +
        "immediately, and if attendees are given, they each get a real invite email. Confirm the exact date, time, " +
        "and any attendees in conversation before calling this unless Prathmesh has already stated them " +
        "unambiguously — 'book it' after he's given specifics doesn't need re-confirming, but a vague request does.",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title." },
          startDateTime: { type: "string", description: "ISO 8601 start, e.g. 2026-08-06T15:00:00+05:30." },
          endDateTime: { type: "string", description: "ISO 8601 end, e.g. 2026-08-06T16:00:00+05:30." },
          description: { type: "string", description: "Optional event description/notes." },
          location: { type: "string", description: "Optional location." },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of attendee email addresses to invite.",
          },
        },
        required: ["summary", "startDateTime", "endDateTime"],
      },
    },
    execute: createEvent,
  },
];
