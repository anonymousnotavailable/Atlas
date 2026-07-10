// Google Gemini has a genuinely free tier (no card required) — see
// https://aistudio.google.com/apikey to get a key. If GEMINI_MODEL errors
// with a 404/model-not-found, check aistudio.google.com for the current
// free-tier model name and set GEMINI_MODEL to match.

const MAX_TOOL_ITERATIONS = 6;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Anthropic-style JSON Schema (lowercase types, as used by our connectors)
// -> Gemini's functionDeclarations format (uppercase types).
function convertSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = convertSchema(value);
    }
  }
  if (schema.items) out.items = convertSchema(schema.items);
  if (schema.required) out.required = schema.required;
  return out;
}

function toGeminiTools(toolSchemas) {
  if (!toolSchemas || toolSchemas.length === 0) return undefined;
  return [{
    functionDeclarations: toolSchemas.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: convertSchema(t.input_schema),
    })),
  }];
}

function toGeminiContents(inputMessages) {
  return inputMessages.map(({ role, content }) => ({
    role: role === "assistant" ? "model" : "user",
    parts: [{ text: content }],
  }));
}

async function callGemini(contents, systemInstruction, tools) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      ...(tools ? { tools } : {}),
    }),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    const err = new Error(data?.error?.message || "Gemini API error.");
    err.status = upstream.status;
    throw err;
  }
  return data;
}

async function chat(inputMessages, system, toolSchemas, executeTool) {
  let contents = toGeminiContents(inputMessages);
  const tools = toGeminiTools(toolSchemas);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callGemini(contents, system, tools);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.filter((p) => p.text).map((p) => p.text).join("");
      return text || "System disruption, Prathmesh. Please try again.";
    }

    contents.push({ role: "model", parts });

    const responseParts = await Promise.all(
      functionCalls.map(async (fc) => ({
        functionResponse: {
          name: fc.functionCall.name,
          response: await executeTool(fc.functionCall.name, fc.functionCall.args || {}),
        },
      }))
    );

    contents.push({ role: "user", parts: responseParts });
  }

  return "I've hit my tool-call limit for this turn, Prathmesh — could you narrow the request?";
}

module.exports = { name: "Gemini", isConfigured, chat };
