// Long-term memory: facts Atlas saves about Prathmesh across conversations,
// persisted to a local JSON file. Injected directly into every system
// prompt (see server.js) so Atlas doesn't need to call a tool just to
// "remember" — it just knows.
//
// Honest caveat: on Render's free tier the disk is wiped on every
// redeploy/restart, so this is session-durable, not permanently durable,
// unless deployed somewhere with a persistent disk.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMemory(facts) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(facts, null, 2));
}

function factsAsText() {
  const facts = loadMemory();
  if (facts.length === 0) return "";
  return facts.map((f) => `- ${f.fact}`).join("\n");
}

async function rememberFact({ fact }) {
  if (!fact || typeof fact !== "string" || !fact.trim()) {
    return { error: "fact (a non-empty string) is required." };
  }
  const facts = loadMemory();
  facts.push({ fact: fact.trim(), savedAt: new Date().toISOString() });
  saveMemory(facts);
  return {
    saved: true,
    totalFacts: facts.length,
    note: "Stored on the server's local disk. On free-tier hosting this resets on redeploy/restart — treat it as durable within a deployment, not forever.",
  };
}

async function recallFacts() {
  const facts = loadMemory();
  if (facts.length === 0) return { facts: [], note: "No facts remembered yet." };
  return { facts: facts.map((f) => ({ fact: f.fact, savedAt: f.savedAt })) };
}

async function forgetFact({ fact }) {
  if (!fact || typeof fact !== "string" || !fact.trim()) {
    return { error: "fact (text to match against stored facts) is required." };
  }
  const facts = loadMemory();
  const needle = fact.trim().toLowerCase();
  const remaining = facts.filter((f) => !f.fact.toLowerCase().includes(needle));
  const removed = facts.length - remaining.length;
  saveMemory(remaining);
  return { removed, remainingCount: remaining.length };
}

module.exports = {
  factsAsText,
  tools: [
    {
      toolSchema: {
        name: "remember_fact",
        description: "Save a fact about Prathmesh to long-term memory so Atlas can recall it in every future conversation (e.g. 'Prathmesh has a job interview on Tuesday', 'Prathmesh prefers concise answers'). Use this proactively whenever the user shares something worth remembering beyond this conversation — don't wait to be asked.",
        input_schema: {
          type: "object",
          properties: { fact: { type: "string", description: "The fact to remember, written in third person, one clear statement." } },
          required: ["fact"],
        },
      },
      execute: rememberFact,
    },
    {
      toolSchema: {
        name: "recall_facts",
        description: "List everything currently remembered about Prathmesh from past conversations. Usually unnecessary since remembered facts are already included in your system context — use this only if Prathmesh explicitly asks what you remember.",
        input_schema: { type: "object", properties: {} },
      },
      execute: recallFacts,
    },
    {
      toolSchema: {
        name: "forget_fact",
        description: "Remove a previously remembered fact by matching part of its text.",
        input_schema: {
          type: "object",
          properties: { fact: { type: "string", description: "Text to match against stored facts for removal." } },
          required: ["fact"],
        },
      },
      execute: forgetFact,
    },
  ],
};
