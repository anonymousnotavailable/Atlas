// In-memory Gemini usage tracker for the "POWER CELLS" HUD. Resets at local
// midnight. No database — a personal single-server app doesn't need one,
// and a restart just re-zeroes the day's count (acceptable for this scope).

const DAILY_REQUEST_BUDGET = parseInt(process.env.GEMINI_DAILY_BUDGET, 10) || 250;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

let state = { date: todayKey(), requestsToday: 0, tokensToday: 0 };

function rolloverIfNewDay() {
  const key = todayKey();
  if (state.date !== key) state = { date: key, requestsToday: 0, tokensToday: 0 };
}

// Called once per upstream Gemini API call (each generateContent request
// counts against the daily request budget, even mid tool-loop turns).
function recordRequest(usage) {
  rolloverIfNewDay();
  state.requestsToday += 1;
  if (usage && typeof usage.totalTokenCount === "number") {
    state.tokensToday += usage.totalTokenCount;
  }
}

function getUsage() {
  rolloverIfNewDay();
  return {
    requestsToday: state.requestsToday,
    tokensToday: state.tokensToday,
    dailyBudget: DAILY_REQUEST_BUDGET,
  };
}

module.exports = { recordRequest, getUsage, DAILY_REQUEST_BUDGET };
