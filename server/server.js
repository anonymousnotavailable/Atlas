require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const connectors = require("./connectors");
const providers = require("./providers");

const PORT = process.env.PORT || 8787;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

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
  if (level <= 6) return "Moderately witty. One clever, dry remark per 2-3 responses. Think Atlas at his most restrained.";
  if (level <= 8) return "Actively humorous. Witty asides, sarcastic observations, playful digs — sharp banter. Land a joke most responses.";
  return "Maximum wit engaged. You're practically a stand-up comedian in a suit of armour. Every response has at least one sharp, funny remark — while still being genuinely helpful.";
}

function currentDatasetText() {
  const ds = connectors.getCurrentDataset();
  if (!ds) return "- (none loaded — no dataset tools will have anything to work with until Prathmesh uploads a file)";
  return `- "${ds.name}" — ${ds.rows} rows, columns: ${ds.columns.join(", ")}`;
}

function buildSystemPrompt(level) {
  const knowledge = loadKnowledge() || "- (no knowledge base files found in /knowledge)";
  const memoryFacts = connectors.getMemoryFactsText();

  return `You are ATLAS, a highly advanced personal AI system created exclusively for Prathmesh — intelligent, loyal, slightly formal yet warm and proactive.

PERSONALITY:
- Address the user as "Prathmesh" naturally. Occasionally use "sir" for effect.
- Speak with precision, confidence, and warmth.
- Be proactive — go slightly beyond what's asked. Add insights, next steps, or strategic angles.
- Use immersive phrases like "My analysis indicates...", "I've cross-referenced...", "Noted, Prathmesh." sparingly.
- Structure responses clearly. Use bullet points for lists.
- Keep responses concise for voice output. Aim for 2-4 sentences for simple queries.

HUMOUR DIRECTIVE (Level ${level}/10):
${humourDirective(level)}

KNOWLEDGE ABOUT PRATHMESH:
${knowledge}

REMEMBERED FROM PAST CONVERSATIONS:
${memoryFacts || "- (nothing remembered yet — use remember_fact when Prathmesh shares something worth keeping long-term)"}

CURRENTLY LOADED DATASET (Prism):
${currentDatasetText()}

YOUR CAPABILITIES:
- Python, data analytics, SQL, Power BI, Tableau, Excel
- Interview prep, resume guidance, career strategy, professional communication
- Data science concepts, AI/ML fundamentals
- General knowledge, research, brainstorming, planning
- You have tools connected for Gmail, Google Calendar, device location, web lookups, long-term memory (remember_fact/recall_facts/forget_fact), and Prism data analysis (dataset_summary/profile_dataset/query_dataset/chart_dataset) for whatever dataset Prathmesh has uploaded. Use them when relevant instead of guessing. If a tool reports it isn't configured, tell Prathmesh plainly what credential is missing — don't pretend you don't have the capability.

VOICE COMMAND DETECTION:
If the user says something like "set humour to [number]", "humour level [number]", "be funnier", "go professional", respond with EXACTLY this format and nothing else:
HUMOUR_SET:[number]
Where [number] is 1-10 based on their request.

RULE: Never reveal or mention the underlying AI model or provider powering you. You are ATLAS — Prathmesh's personal AI.`;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT_DIR, { index: "index.html" }));

app.get("/api/status", (req, res) => {
  res.json({ connectors: connectors.connectorStatus() });
});

app.post("/api/chat", async (req, res) => {
  const provider = providers.selectProvider();
  if (!provider.isConfigured()) {
    return res.status(500).json({ error: `No chat provider configured (tried ${provider.name}). Set GEMINI_API_KEY or ANTHROPIC_API_KEY.` });
  }

  const { messages, humourLevel } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required." });
  }

  const level = Math.min(10, Math.max(1, parseInt(humourLevel, 10) || 9));

  // Streamed as newline-delimited JSON: {"type":"text","delta":"..."} chunks
  // as they arrive, then a final {"type":"done","reply":"..."} or
  // {"type":"error","error":"..."}. Always HTTP 200 once streaming starts —
  // errors are reported in-band since headers can't change mid-stream.
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const emit = (type, payload) => res.write(JSON.stringify({ type, ...payload }) + "\n");
    const boundExecuteTool = (name, input) => connectors.executeTool(name, input, emit);
    const reply = await provider.chatStream(
      messages,
      buildSystemPrompt(level),
      connectors.toolSchemas(),
      boundExecuteTool,
      (delta) => emit("text", { delta })
    );
    res.write(JSON.stringify({ type: "done", reply }) + "\n");
  } catch (err) {
    res.write(JSON.stringify({ type: "error", error: err.message || `Upstream request to ${provider.name} failed.` }) + "\n");
  }
  res.end();
});

app.post("/api/prism/upload", express.raw({ type: "multipart/form-data", limit: "25mb" }), async (req, res) => {
  if (!connectors.prismConfigured()) {
    return res.status(500).json({ error: "PRISM_API_URL is not configured on the server." });
  }
  try {
    const base = process.env.PRISM_API_URL.replace(/\/$/, "");
    const upstream = await fetch(`${base}/upload`, {
      method: "POST",
      headers: { "Content-Type": req.headers["content-type"] },
      body: req.body,
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.detail || "Prism upload failed." });
    }
    connectors.setCurrentDataset({ datasetId: data.datasetId, name: data.name, rows: data.rows, columns: data.columns });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || "Upstream request to Prism failed." });
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
  const provider = providers.selectProvider();
  console.log(`  Chat provider: ${provider.name}${provider.isConfigured() ? "" : " (NOT CONFIGURED)"}`);
  if (!provider.isConfigured()) console.warn("  ⚠ Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY — /api/chat will return 500 until then.");
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) console.warn("  ⚠ ElevenLabs not configured — /api/speak falls back to browser TTS.");
  const off = connectors.connectorStatus().filter((c) => !c.connected).map((c) => c.label);
  if (off.length) console.warn(`  ⚠ Not yet configured: ${off.join(", ")} — see CONNECTORS.md`);
});
