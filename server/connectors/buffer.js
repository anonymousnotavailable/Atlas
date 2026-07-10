const NOT_CONFIGURED = "Buffer isn't connected yet. Prathmesh needs to set BUFFER_ACCESS_TOKEN in server/.env (see CONNECTORS.md).";

function configured() {
  return Boolean(process.env.BUFFER_ACCESS_TOKEN);
}

async function listProfiles() {
  if (!configured()) return { error: NOT_CONFIGURED };
  try {
    const res = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${process.env.BUFFER_ACCESS_TOKEN}`);
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Buffer request failed." };
    return { profiles: (data || []).map((p) => ({ id: p.id, service: p.service, username: p.formatted_username })) };
  } catch (err) {
    return { error: err.message || "Buffer request failed." };
  }
}

// Queues the post into Buffer's normal posting schedule rather than publishing
// instantly (now=false) — Atlas should never make a post go live without
// Prathmesh reviewing it in the Buffer queue first.
async function draftPost({ text, profileIds }) {
  if (!configured()) return { error: NOT_CONFIGURED };
  if (!text) return { error: "text is required." };
  if (!Array.isArray(profileIds) || profileIds.length === 0) {
    return { error: "profileIds is required — call buffer_list_profiles first to find them." };
  }

  try {
    const body = new URLSearchParams({ access_token: process.env.BUFFER_ACCESS_TOKEN, text, now: "false" });
    profileIds.forEach((id) => body.append("profile_ids[]", id));

    const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok || data.success === false) return { error: data.message || "Buffer draft creation failed." };
    return { queued: true, note: "Added to Buffer's queue — still needs to be reviewed/approved in Buffer before it goes live.", updates: data.updates };
  } catch (err) {
    return { error: err.message || "Buffer request failed." };
  }
}

module.exports = [
  {
    toolSchema: {
      name: "buffer_list_profiles",
      description: "List Prathmesh's connected Buffer social profiles (id, service, username). Call this before buffer_draft_post to get valid profileIds.",
      input_schema: { type: "object", properties: {} },
    },
    execute: listProfiles,
  },
  {
    toolSchema: {
      name: "buffer_draft_post",
      description: "Queue a social media post via Buffer. This adds it to Buffer's queue for Prathmesh to review — it does not publish instantly.",
      input_schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The post content." },
          profileIds: { type: "array", items: { type: "string" }, description: "Buffer profile IDs to post to (from buffer_list_profiles)." },
        },
        required: ["text", "profileIds"],
      },
    },
    execute: draftPost,
  },
];
