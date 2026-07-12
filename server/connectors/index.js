const gmail = require("./gmail");
const calendar = require("./calendar");
const webfetch = require("./webfetch");
const device = require("./device");
const memory = require("./memory");
const prism = require("./prism");
const providers = require("../providers");

const ALL_TOOLS = [...gmail, ...calendar, ...webfetch, ...device.tools, ...memory.tools, ...prism.tools];

const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.toolSchema.name, t]));

function toolSchemas() {
  return ALL_TOOLS.map((t) => t.toolSchema);
}

// emit(type, payload) is optional — lets a tool (e.g. chart_dataset) stream
// data straight to the client, bypassing the model's own text context.
async function executeTool(name, input, emit) {
  const tool = TOOL_MAP.get(name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(input || {}, emit);
  } catch (err) {
    return { error: err.message || "Tool execution failed." };
  }
}

// Every wire Atlas can reach, in one place — powers the "Wires" panel in
// index.html and GET /api/status.
function connectorStatus() {
  const chatProvider = providers.selectProvider();
  return [
    { id: "chat", label: `Chat (${chatProvider.name})`, connected: chatProvider.isConfigured() },
    { id: "elevenlabs", label: "Voice (ElevenLabs)", connected: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
    { id: "google", label: "Gmail + Calendar (Google)", connected: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) },
    { id: "webFetch", label: "Web lookups", connected: true },
    { id: "deviceLocation", label: "Device location", connected: true },
    { id: "memory", label: "Memory", connected: true },
    { id: "prism", label: "Prism (data analysis)", connected: prism.isConfigured() },
  ];
}

module.exports = {
  toolSchemas,
  executeTool,
  connectorStatus,
  setDeviceLocation: device.setLocation,
  getMemoryFactsText: memory.factsAsText,
  setCurrentDataset: prism.setCurrentDataset,
  getCurrentDataset: prism.getCurrentDataset,
  prismConfigured: prism.isConfigured,
};
