require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const connectors = require("./connectors");

const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const MAX_TOOL_ITERATIONS = 6;

const ROOT_DIR = path.join(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge");

function loadKnowledge() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return "";
  return fs.readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8").trim())
    .join("\n\n");
}

function humourDirective(level) {
  if (level <= 2) return "You are strictly professional, zero jokes. Precision only.";
  if (level <= 4) return "Occasionally dry, understated wit — one subtle quip per 4-5 responses max.";
  if (level <= 6) return "Moderately witty. One clever, dry remark per 2-3 responses. Think Jarvis at his most restrained.";
  if (level <= 8) return "Actively humorous. Witty asides, sarcastic observations, playful digs — Jarvis-level banter. Land a joke most responses.";
  return "Maximum wit engaged. You're practically a stand-up comedian in a suit of armour. Every response has at least one sharp, funny remark — while still being genuinely helpful. Think Jarvis with Tony Stark's permission to roast.";
}

function buildSystemPrompt(level) {
  const knowledge = loadKnowledge() || "- (no knowledge base files found in /knowledge)";

  return `You are ATLAS, a highly advanced personal AI system created exclusively for Prathmesh. You are inspired by JARVIS from Iron Man — intelligent, loyal, slightly formal yet warm and proactive.

PERSONALITY:
- Address the user as "Prathmesh" naturally. Occasionally use "sir" for a JARVIS-like effect.
- Speak with precision, confidence, and warmth.
- Be proactive — go slightly beyond what's asked. Add insights, next steps, or strategic angles.
- Use immersive phrases like "My analysis indicates...", "I've cross-referenced...", "Noted, Prathmesh." sparingly.
- Structure responses clearly. Use bullet points for lists.
- Keep responses concise for voice output. Aim for 2-4 sentences for simple queries.

HUMOUR DIRECTIVE (Level ${level}/10):
${humourDirective(level)}

KNOWLEDGE ABOUT PRATHMESH:
${knowledge}

YOUR CAPABILITIES:
- Python, data analytics, SQL, Power BI, Tableau, Excel
- Interview prep, resume guidance, career strategy, professional communication
- Data science concepts, AI/ML fundamentals
- General knowledge, research, brainstorming, planning
- You have tools connected for Gmail, Google Calendar, RevenueCat, Buffer, Instagram, Meta Ads, device location, and web lookups. Use them when relevant instead of guessing. If a tool reports it isn't configured, tell Prathmesh plainly what credential is missing — don't pretend you don't have the capability.

VOICE COMMAND DETECTION:
If the user says something like "set humour to [number]", "humour level [number]", "be funnier", "go professional", respond with EXACTLY this format and nothing else:
HUMOUR_SET:[number]
Where [number] is 1-10 based on their request.

RULE: Never say you are Claude or mention Anthropic. You are ATLAS — Prathmesh's personal AI.`;
}

async function callAnthropic(conversation, system) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system,
      messages: conversation,
      tools: connectors.toolSchemas(),
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    const err = new Error(data?.error?.message || "Anthropic API error.");
    err.status = upstream.status;
    throw err;
  }
  return data;
}

function textFromContent(content) {
  return (content || []).filter((b) => b.type === "text").map((b) => b.text).join("") || "System disruption, Prathmesh. Please try again.";
}

async function runAgentLoop(inputMessages, level) {
  const system = buildSystemPrompt(level);
  let conversation = inputMessages.map(({ role, content }) => ({ role, content }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callAnthropic(conversation, system);

    if (data.stop_reason !== "tool_use") {
      return textFromContent(data.content);
    }

    conversation.push({ role: "assistant", content: data.content });

    const toolUses = data.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(await connectors.executeTool(tu.name, tu.input)),
      }))
    );

    conversation.push({ role: "user", content: toolResults });
  }

  return "I've hit my tool-call limit for this turn, Prathmesh — could you narrow the request?";
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT_DIR, { index: "index.html" }));

app.get("/api/status", (req, res) => {
  res.json({ connectors: connectors.connectorStatus() });
});

app.post("/api/chat", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }

  const { messages, humourLevel } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required." });
  }

  const level = Math.min(10, Math.max(1, parseInt(humourLevel, 10) || 9));

  try {
    const reply = await runAgentLoop(messages, level);
    res.json({ reply });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Upstream request to Anthropic failed." });
  }
});

app.post("/api/speak", async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required." });
  }
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return res.status(501).json({ error: "ElevenLabs is not configured on the server." });
  }

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: errText || "ElevenLabs request failed." });
    }

    res.set("Content-Type", "audio/mpeg");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: "Upstream request to ElevenLabs failed." });
  }
});

app.post("/api/device/location", (req, res) => {
  const { lat, lng, accuracy } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng (numbers) are required." });
  }
  connectors.setDeviceLocation({ lat, lng, accuracy: typeof accuracy === "number" ? accuracy : null });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Atlas backend listening on http://localhost:${PORT}`);
  if (!ANTHROPIC_API_KEY) console.warn("  ⚠ ANTHROPIC_API_KEY not set — /api/chat will return 500 until configured.");
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) console.warn("  ⚠ ElevenLabs not configured — /api/speak falls back to browser TTS.");
  const status = connectors.connectorStatus();
  const off = Object.entries(status).filter(([, v]) => v === false).map(([k]) => k);
  if (off.length) console.warn(`  ⚠ Connectors not yet configured: ${off.join(", ")} — see CONNECTORS.md`);
});
