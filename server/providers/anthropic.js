const MAX_TOOL_ITERATIONS = 6;

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function callAnthropic(conversation, system, toolSchemas) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system,
      messages: conversation,
      tools: toolSchemas,
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

async function chat(inputMessages, system, toolSchemas, executeTool) {
  return chatStream(inputMessages, system, toolSchemas, executeTool, null);
}

// Line-based rather than blank-line-block-based — see the matching comment
// in providers/gemini.js for why: don't assume a trailing "\n\n" is always
// present after the last event in a stream.
async function* sseEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingEvent = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("event:")) {
        pendingEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const jsonStr = line.slice(5).trim();
        if (jsonStr) {
          try { yield { event: pendingEvent, data: JSON.parse(jsonStr) }; } catch (e) { /* skip malformed chunk */ }
        }
        pendingEvent = null;
      }
    }
  }
}

async function callAnthropicStream(conversation, system, toolSchemas) {
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system,
      messages: conversation,
      tools: toolSchemas,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}));
    const err = new Error(data?.error?.message || `Anthropic API error (${upstream.status}).`);
    err.status = upstream.status;
    throw err;
  }
  return upstream;
}

async function chatStream(inputMessages, system, toolSchemas, executeTool, onDelta) {
  let conversation = inputMessages.map(({ role, content }) => ({ role, content }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const upstream = await callAnthropicStream(conversation, system, toolSchemas);

    const blocks = [];
    let stopReason = null;

    for await (const { event, data } of sseEvents(upstream)) {
      if (event === "content_block_start") {
        blocks[data.index] = data.content_block.type === "tool_use"
          ? { type: "tool_use", id: data.content_block.id, name: data.content_block.name, jsonBuf: "" }
          : { type: "text", text: "" };
      } else if (event === "content_block_delta") {
        const block = blocks[data.index];
        if (!block) continue;
        if (data.delta.type === "text_delta") {
          block.text += data.delta.text;
          if (onDelta) onDelta(data.delta.text);
        } else if (data.delta.type === "input_json_delta") {
          block.jsonBuf += data.delta.partial_json;
        }
      } else if (event === "message_delta") {
        stopReason = data.delta?.stop_reason || stopReason;
      }
    }

    if (stopReason !== "tool_use") {
      const text = blocks.filter((b) => b && b.type === "text").map((b) => b.text).join("");
      return text || "System disruption, Prathmesh. Please try again.";
    }

    const assistantContent = blocks.filter(Boolean).map((b) =>
      b.type === "tool_use"
        ? { type: "tool_use", id: b.id, name: b.name, input: b.jsonBuf ? JSON.parse(b.jsonBuf) : {} }
        : { type: "text", text: b.text }
    );
    conversation.push({ role: "assistant", content: assistantContent });

    const toolUses = assistantContent.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(await executeTool(tu.name, tu.input)),
      }))
    );
    conversation.push({ role: "user", content: toolResults });
  }

  return "I've hit my tool-call limit for this turn, Prathmesh — could you narrow the request?";
}

module.exports = { name: "Anthropic", isConfigured, chat, chatStream };
