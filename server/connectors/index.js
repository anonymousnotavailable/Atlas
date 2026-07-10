const gmail = require("./gmail");
const calendar = require("./calendar");
const revenuecat = require("./revenuecat");
const buffer = require("./buffer");
const meta = require("./meta");
const webfetch = require("./webfetch");
const device = require("./device");

const ALL_TOOLS = [...gmail, ...calendar, ...revenuecat, ...buffer, ...meta, ...webfetch, ...device.tools];

const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.toolSchema.name, t]));

function toolSchemas() {
  return ALL_TOOLS.map((t) => t.toolSchema);
}

async function executeTool(name, input) {
  const tool = TOOL_MAP.get(name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(input || {});
  } catch (err) {
    return { error: err.message || "Tool execution failed." };
  }
}

// Connector status for a /api/status endpoint — lets the dashboard (and
// Prathmesh) see at a glance what's wired up vs still needs credentials.
function connectorStatus() {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
    revenuecat: Boolean(process.env.REVENUECAT_API_KEY && process.env.REVENUECAT_PROJECT_ID),
    buffer: Boolean(process.env.BUFFER_ACCESS_TOKEN),
    instagram: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID),
    metaAds: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID),
    webFetch: true,
    deviceLocation: true,
  };
}

module.exports = { toolSchemas, executeTool, connectorStatus, setDeviceLocation: device.setLocation };
