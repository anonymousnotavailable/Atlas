// Google Gemini has a genuinely free tier (no card required) — see
// https://aistudio.google.com/apikey to get a key. If GEMINI_MODEL errors
// with a 404/model-not-found, check aistudio.google.com for the current
// free-tier model name and set GEMINI_MODEL to match.

const MAX_TOOL_ITERATIONS = 6;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
  return inputMessages.map(({ role, content, image }) => {
    const parts = [];
    if (image && image.data && image.mimeType) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
    parts.push({ text: content });
    return { role: role === "assistant" ? "model" : "user", parts };
  });
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
  return chatStream(inputMessages, system, toolSchemas, executeTool, null, null);
}

// Parses a fetch Response body in Gemini's SSE stream format. Line-based
// rather than blank-line-block-based: Gemini's actual output is "data:
// {...}\n" per event without a guaranteed trailing blank line (confirmed by
// direct testing — a single-event response had no "\n\n" anywhere in the
// body at all, which silently dropped every event under a block-based
// parser). Each data: line's JSON payload is always single-line since JSON
// escapes embedded newlines, so line-based splitting is safe and robust to
// either framing style.
async function* sseEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try { yield JSON.parse(jsonStr); } catch (e) { /* skip malformed chunk */ }
    }
  }
  if (buffer.startsWith("data:")) {
    const jsonStr = buffer.slice(5).trim();
    if (jsonStr) { try { yield JSON.parse(jsonStr); } catch (e) {} }
  }
}

async function callGeminiStream(contents, systemInstruction, tools) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      ...(tools ? { tools } : {}),
    }),
  });

  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}));
    const err = new Error(data?.error?.message || `Gemini API error (${upstream.status}).`);
    err.status = upstream.status;
    throw err;
  }
  return upstream;
}

// Streams text deltas to onDelta(text) as they arrive. Tool-call turns
// (functionCall parts) aren't streamed character-by-character — Gemini
// sends a function call as one complete part, not incremental deltas — so
// those turns execute the tool and loop silently before the next turn
// (which does stream) begins.
async function chatStream(inputMessages, system, toolSchemas, executeTool, onDelta, onUsage) {
  let contents = toGeminiContents(inputMessages);
  const tools = toGeminiTools(toolSchemas);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const upstream = await callGeminiStream(contents, system, tools);

    let fullText = "";
    const functionCalls = [];
    let usageMetadata = null;

    for await (const event of sseEvents(upstream)) {
      const parts = event.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          fullText += part.text;
          if (onDelta) onDelta(part.text);
        } else if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }
      if (event.usageMetadata) usageMetadata = event.usageMetadata;
    }

    if (onUsage && usageMetadata) onUsage(usageMetadata);

    if (functionCalls.length === 0) {
      return fullText || "System disruption, Prathmesh. Please try again.";
    }

    contents.push({ role: "model", parts: functionCalls.map((fc) => ({ functionCall: fc })) });

    const responseParts = await Promise.all(
      functionCalls.map(async (fc) => ({
        functionResponse: { name: fc.name, response: await executeTool(fc.name, fc.args || {}) },
      }))
    );

    contents.push({ role: "user", parts: responseParts });
  }

  return "I've hit my tool-call limit for this turn, Prathmesh — could you narrow the request?";
}

module.exports = { name: "Gemini", isConfigured, chat, chatStream };
