// Builds and pushes the daily morning briefing — the one genuinely
// proactive thing Atlas does without being asked. Pulls real data from
// whatever's actually connected (calendar, gmail, memory), then asks the
// chat provider for a short, plainly-worded summary in Atlas's own voice
// rather than a templated string — same persona as everywhere else.

const connectors = require("../connectors");
const providers = require("../providers");
const push = require("./push");

const NOOP_EXECUTE = async () => ({});

async function gatherContext() {
  const lines = [];

  try {
    const calendar = require("../connectors/calendar");
    const calTool = calendar.find((t) => t.toolSchema.name === "calendar_upcoming_events");
    const events = await calTool.execute({ maxResults: 8, daysAhead: 1 });
    if (events.error) {
      lines.push(`Calendar: ${events.error}`);
    } else if (events.events.length === 0) {
      lines.push("Calendar: nothing on the books in the next 24 hours.");
    } else {
      lines.push(`Calendar (next 24h): ${events.events.map((e) => `"${e.summary}" at ${e.start}`).join("; ")}`);
    }
  } catch (err) {
    lines.push("Calendar: unavailable.");
  }

  try {
    const gmail = require("../connectors/gmail");
    const gmailTool = gmail.find((t) => t.toolSchema.name === "gmail_search");
    const mail = await gmailTool.execute({ query: "is:unread newer_than:1d", maxResults: 5 });
    if (mail.error) {
      lines.push(`Email: ${mail.error}`);
    } else if (!mail.results || mail.results.length === 0) {
      lines.push("Email: no new unread mail in the last day.");
    } else {
      lines.push(`Email (unread, last 24h): ${mail.results.map((m) => `"${m.subject}" from ${m.from}`).join("; ")}`);
    }
  } catch (err) {
    lines.push("Email: unavailable.");
  }

  const memoryFacts = connectors.getMemoryFactsText();
  if (memoryFacts) lines.push(`Remembered about Prathmesh: ${memoryFacts}`);

  return lines.join("\n");
}

async function composeBriefingText() {
  const provider = providers.selectProvider();
  if (!provider.isConfigured()) return null;

  const context = await gatherContext();
  const system =
    "You are ATLAS, Prathmesh's personal AI, writing his morning briefing — a short push notification, not a chat " +
    "reply. Talk like Claude in Atlas's voice: plain, direct, no theatrical phrasing, no 'Good morning sir'. " +
    "Given the raw data below, write 2-3 sentences max covering what's actually worth knowing (real calendar " +
    "events, real unread mail worth noting) — skip anything that's empty or unconfigured, don't apologize for " +
    "missing connectors, don't pad with fluff if there's genuinely nothing going on. No markdown, no bullet " +
    "points — this has to read as plain notification text.";

  const messages = [{ role: "user", content: `Raw data for today's briefing:\n${context}` }];

  try {
    const reply = await provider.chat(messages, system, [], NOOP_EXECUTE);
    return reply.trim();
  } catch (err) {
    return null;
  }
}

async function runBriefingNow() {
  if (!push.hasSubscriptions()) return { sent: 0, skipped: "no subscriptions" };

  const text = await composeBriefingText();
  const body = text || "Your morning briefing is ready, but I couldn't reach the chat provider to write it — open Atlas to check in manually.";

  return push.sendToAll({
    title: "🌅 Atlas — Morning Briefing",
    body,
    url: "/",
  });
}

module.exports = { runBriefingNow };
