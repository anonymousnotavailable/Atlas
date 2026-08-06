// Long-term memory: facts Atlas saves about Prathmesh across conversations,
// persisted to a local JSON file. Injected directly into every system
// prompt (see server.js) so Atlas doesn't need to call a tool just to
// "remember" — it just knows.
//
// Categorized (preference / project / recurring / relationship / general)
// rather than a flat list, so the system prompt reads like an actual
// relationship model instead of a junk drawer — recent, ongoing project
// context surfaces separately from one-off preferences. Old entries saved
// before categorization existed default to "general".
//
// Honest caveat: on Render's free tier the disk is wiped on every
// redeploy/restart, so this is session-durable, not permanently durable,
// unless deployed somewhere with a persistent disk.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");

const CATEGORIES = ["preference", "project", "recurring", "relationship", "general"];
const CATEGORY_LABELS = {
  preference: "PREFERENCES",
  project: "ONGOING PROJECTS",
  recurring: "RECURRING / SCHEDULE",
  relationship: "PEOPLE & RELATIONSHIPS",
  general: "GENERAL",
};
// Per-category cap on what gets injected into the system prompt — keeps it
// from growing unbounded over months of use. Storage itself is uncapped;
// this only bounds what's shown, always favoring the most recent.
const MAX_PER_CATEGORY = 12;

function loadMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    // Normalize legacy entries (no category field) forward.
    return parsed.map((f) => ({ ...f, category: CATEGORIES.includes(f.category) ? f.category : "general" }));
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

  const byCategory = {};
  for (const cat of CATEGORIES) byCategory[cat] = [];
  for (const f of facts) byCategory[f.category].push(f);

  const sections = [];
  for (const cat of CATEGORIES) {
    const items = byCategory[cat]
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .slice(0, MAX_PER_CATEGORY);
    if (items.length === 0) continue;
    sections.push(`${CATEGORY_LABELS[cat]}:\n${items.map((f) => `- ${f.fact}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

async function rememberFact({ fact, category }) {
  if (!fact || typeof fact !== "string" || !fact.trim()) {
    return { error: "fact (a non-empty string) is required." };
  }
  const facts = loadMemory();
  const cat = CATEGORIES.includes(category) ? category : "general";
  facts.push({ fact: fact.trim(), category: cat, savedAt: new Date().toISOString() });
  saveMemory(facts);
  return {
    saved: true,
    category: cat,
    totalFacts: facts.length,
    note: "Stored on the server's local disk. On free-tier hosting this resets on redeploy/restart — treat it as durable within a deployment, not forever.",
  };
}

async function recallFacts() {
  const facts = loadMemory();
  if (facts.length === 0) return { facts: [], note: "No facts remembered yet." };
  return { facts: facts.map((f) => ({ fact: f.fact, category: f.category, savedAt: f.savedAt })) };
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
        description: "Save a fact about Prathmesh to long-term memory so Atlas can recall it in every future conversation (e.g. 'Prathmesh has a job interview on Tuesday', 'Prathmesh prefers concise answers', 'Prathmesh is building a project called Prism'). Use this proactively whenever the user shares something worth remembering beyond this conversation — don't wait to be asked. This is what makes Atlas feel like an ongoing relationship instead of a fresh stranger every session — err toward remembering, not toward asking permission first.",
        input_schema: {
          type: "object",
          properties: {
            fact: { type: "string", description: "The fact to remember, written in third person, one clear statement." },
            category: {
              type: "string",
              enum: CATEGORIES,
              description:
                "preference (how Prathmesh likes things done), project (something ongoing he's building/working on), " +
                "recurring (a repeating commitment or schedule pattern), relationship (a person and how they relate to " +
                "Prathmesh), or general (anything else). Defaults to general if omitted.",
            },
          },
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
