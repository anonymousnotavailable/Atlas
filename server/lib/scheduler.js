// Fires the morning briefing once a day at BRIEFING_HOUR (local to
// BRIEFING_TIMEZONE). Deliberately no cron dependency — a plain
// once-a-minute check against Intl.DateTimeFormat's timezone-aware output
// is all a single daily firing needs, and it's one less package to trust.
//
// Honest limitation: this only fires while the Node process is actually
// running. Free-tier hosts (e.g. Render's free plan) spin the process down
// after ~15 minutes idle and only wake it on an incoming request — if that
// happens to be asleep at BRIEFING_HOUR, that day's briefing is silently
// missed, no error, nothing to catch. See CONNECTORS.md for the fix (an
// external uptime pinger, or a paid plan that doesn't sleep).

const briefing = require("./briefing");

const HOUR = Math.min(23, Math.max(0, parseInt(process.env.BRIEFING_HOUR, 10) || 7));
const TIMEZONE = process.env.BRIEFING_TIMEZONE || "UTC";

let lastFiredDate = null; // "YYYY-MM-DD" in TIMEZONE, guards against firing twice in the same day

function localNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: parseInt(get("hour"), 10), minute: parseInt(get("minute"), 10) };
}

async function tick() {
  const now = localNow();
  if (now.hour !== HOUR || now.minute !== 0) return;
  if (lastFiredDate === now.date) return; // already fired today

  lastFiredDate = now.date;
  try {
    const result = await briefing.runBriefingNow();
    if (result.sent > 0) console.log(`[briefing] sent to ${result.sent} device(s)`);
  } catch (err) {
    console.error("[briefing] failed:", err.message || err);
  }
}

function start() {
  console.log(`  Morning briefing scheduled for ${String(HOUR).padStart(2, "0")}:00 ${TIMEZONE}`);
  setInterval(tick, 60 * 1000);
}

module.exports = { start };
