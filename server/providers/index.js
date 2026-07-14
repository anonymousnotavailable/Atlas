const anthropic = require("./anthropic");
const gemini = require("./gemini");

// CHAT_PROVIDER=gemini|anthropic forces a choice. Otherwise: prefer Gemini
// (free tier, no card) if GEMINI_API_KEY is set, else fall back to Anthropic.
function selectProvider() {
  const explicit = (process.env.CHAT_PROVIDER || "").toLowerCase();
  if (explicit === "gemini") return gemini;
  if (explicit === "anthropic") return anthropic;
  if (gemini.isConfigured()) return gemini;
  return anthropic;
}

module.exports = { selectProvider, anthropic, gemini };
