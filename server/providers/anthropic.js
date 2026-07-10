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
  let conversation = inputMessages.map(({ role, content }) => ({ role, content }));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callAnthropic(conversation, system, toolSchemas);

    if (data.stop_reason !== "tool_use") {
      return textFromContent(data.content);
    }

    conversation.push({ role: "assistant", content: data.content });

    const toolUses = data.content.filter((b) => b.type === "tool_use");
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

module.exports = { name: "Anthropic", isConfigured, chat };
