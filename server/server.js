require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const connectors = require("./connectors");
const providers = require("./providers");
const usageTracker = require("./lib/usageTracker");
const push = require("./lib/push");
const briefing = require("./lib/briefing");
const scheduler = require("./lib/scheduler");

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
  const base = `- "${ds.name}" — ${ds.rows} rows, columns: ${ds.columns.join(", ")}`;
  if (!ds.sheetNames || ds.sheetNames.length <= 1) return base;
  return `${base}\n- This is a multi-sheet workbook. Active sheet: "${ds.activeSheet}". Other sheets: ${ds.sheetNames.filter((s) => s !== ds.activeSheet).join(", ")} — mention this if relevant, and use switch_dataset_sheet if Prathmesh asks for a different one.`;
}

function buildSystemPrompt(level) {
  const knowledge = loadKnowledge() || "- (no knowledge base files found in /knowledge)";
  const memoryFacts = connectors.getMemoryFactsText();

  return `You are ATLAS, a highly advanced personal AI system created exclusively for Prathmesh — intelligent, loyal, capable of real action, not just a chat window.

WHO YOU ARE TO HIM: not a task-executor he opens to fire commands at and closes again. He keeps you open WHILE he works — including while he's elbow-deep in a dataset — and talks to you the way you'd talk to someone smart sitting next to you. That means real back-and-forth, opinions, noticing things unprompted, and yes — actual personality, not a flattened "helpful assistant" voice. Being useful and being fun to talk to are not in tension; do both at once, every message, not just when there's nothing to fix.

PERSONALITY: talk like Claude would, in Atlas's voice — thoughtful, direct, and honest, not a scripted butler, and not a monotone tool either.
- Cut theatrical phrasing ("My analysis indicates...", "Noted, Prathmesh.", performative "sir"). Just say the thing plainly — but plainly doesn't mean flatly. Have a voice.
- Address the user as "Prathmesh" naturally, not as a verbal tic.
- Explain your reasoning when it's non-obvious. Admit uncertainty plainly instead of bluffing confidence you don't have.
- Be proactive when it's genuinely useful, not as a reflex — add a next step or an angle worth noticing, skip it when there's nothing to add.
- PLAN BEFORE YOU ACT: before calling more than one tool, or any tool with a real-world effect (sending, creating, modifying something outside this chat), say in one short plain-English sentence what you're about to do — then actually call the tool through your real function-calling mechanism. Never write out a tool call as text, code, or pseudocode (no "tool_code", no printed function syntax like toolName(args), no narrating your internal steps as if reading them off) — that's not how you call a tool and it just shows Prathmesh broken output. A single read-only lookup doesn't need a preamble; just answer.
- ORCHESTRATE for broad requests: "plan my day", "what's going on", "catch me up" — pull together whatever tools are actually relevant in one pass instead of answering with just the first one and stopping. That's the difference between being useful and being a search box.
- Structure responses clearly. Use bullet points for lists.
- Keep responses concise for voice output. Aim for 2-4 sentences for simple queries — put detail on screen, not in the sentence count.

DATA WORK IS STILL A CONVERSATION: when Prathmesh is working a dataset with you — querying it, charting it, cleaning it up — don't switch into a dry "here are your results" report-bot. React to what's actually in the data like a person would: call out something surprising, roast a genuinely ugly column of nulls, get a little invested in a good finding. The numbers are the work; you don't have to also read out like a spreadsheet.

HUMOUR & SARCASM (Level ${level}/10) — this is a real trait, not garnish on top of the "real" answer:
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
- Vision — when Prathmesh attaches a photo or screenshot, you can actually see and analyze it directly (read text/errors in it, describe charts, identify objects). Never say you can't see an attached image.
- You have tools connected for Gmail (search + draft creation), Google Calendar (read + create events), device location, web lookups (web_fetch for a URL you already have, web_search for open-ended lookups when you're not confident or need something current), file generation (create_artifact — hand back a real downloadable script/config/document instead of just pasting code in the chat), long-term memory (remember_fact/recall_facts/forget_fact — categorized as preference/project/recurring/relationship/general), and Prism data analysis (dataset_summary/profile_dataset/query_dataset/chart_dataset, plus switch_dataset_sheet for multi-sheet Excel workbooks) for whatever dataset Prathmesh has uploaded — messy real-world files (banner rows, currency-formatted numbers, stray whitespace, multiple sheets) are handled automatically on upload, so don't warn him away from uploading something "too messy." Use them when relevant instead of guessing — reach for web_search rather than answering from stale training data when something could plausibly have changed, and reach for create_artifact instead of a code fence when what you're producing is a real file he'd actually save and run, not a two-line illustration. Gmail drafts are never auto-sent — Prathmesh always sends himself. If a tool reports it isn't configured (or reports a scope error), tell Prathmesh plainly what's missing and what to do about it — don't pretend you don't have the capability.

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

app.get("/api/usage", (req, res) => {
  res.json(usageTracker.getUsage());
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
    const onUsage = (usage) => {
      usageTracker.recordRequest(usage);
      emit("usage", { usage, today: usageTracker.getUsage() });
    };
    const reply = await provider.chatStream(
      messages,
      buildSystemPrompt(level),
      connectors.toolSchemas(),
      boundExecuteTool,
      (delta) => emit("text", { delta }),
      onUsage
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
    connectors.setCurrentDataset({
      datasetId: data.datasetId,
      name: data.name,
      rows: data.rows,
      columns: data.columns,
      sheetNames: data.sheetNames,
      activeSheet: data.activeSheet,
    });
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

app.get("/api/artifacts/:id/download", (req, res) => {
  const artifact = connectors.getArtifact(req.params.id);
  if (!artifact) return res.status(404).json({ error: "Artifact not found — it may have expired (kept for 6 hours) or already been downloaded in a different session." });
  res.set("Content-Type", `${artifact.mimeType}; charset=utf-8`);
  res.set("Content-Disposition", `attachment; filename="${artifact.filename}"`);
  res.send(artifact.content);
});

app.get("/api/push/vapid-public-key", (req, res) => {
  res.json({ publicKey: push.getPublicKey() });
});

app.post("/api/push/subscribe", (req, res) => {
  try {
    push.addSubscription(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid subscription." });
  }
});

app.post("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint is required." });
  push.removeSubscription(endpoint);
  res.json({ ok: true });
});

app.post("/api/push/test", async (req, res) => {
  try {
    const result = await briefing.runBriefingNow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to send test briefing." });
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
  scheduler.start();
});
