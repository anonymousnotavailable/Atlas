const NOT_CONFIGURED =
  "Web search isn't connected yet. Prathmesh needs to set TAVILY_API_KEY in server/.env (see CONNECTORS.md) — " +
  "web_fetch still works for a URL he already has, but open search needs this.";

// pd/pw/pm/py kept as the tool's own vocabulary (matches web_fetch-adjacent
// tools elsewhere) and mapped to Tavily's time_range values here, so a
// future provider swap only touches this one file.
const FRESHNESS_MAP = { pd: "day", pw: "week", pm: "month", py: "year" };

function isConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

async function webSearch({ query, count, freshness }) {
  if (!isConfigured()) return { error: NOT_CONFIGURED };
  if (!query || !query.trim()) return { error: "query is required." };

  const limit = Math.min(10, Math.max(1, parseInt(count, 10) || 5));
  const body = {
    api_key: process.env.TAVILY_API_KEY,
    query: query.trim(),
    max_results: limit,
    search_depth: "basic",
  };
  if (freshness && FRESHNESS_MAP[freshness]) body.time_range = FRESHNESS_MAP[freshness];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { error: "Tavily rejected the API key — check TAVILY_API_KEY in server/.env." };
      }
      if (res.status === 429) {
        return { error: "Tavily rate limit hit — the free tier caps monthly credits. Try again shortly." };
      }
      const errBody = await res.json().catch(() => ({}));
      return { error: errBody.detail || errBody.error || `Web search failed with status ${res.status}.` };
    }

    const data = await res.json();
    const results = (data.results || []).slice(0, limit).map((r) => ({
      title: r.title || "",
      url: r.url,
      snippet: (r.content || "").slice(0, 500),
      publishedDate: r.published_date || undefined,
    }));

    if (results.length === 0) return { results: [], note: `No results for "${query}".` };
    return { query, results };
  } catch (err) {
    clearTimeout(timeout);
    return { error: err.name === "AbortError" ? "Web search timed out." : err.message || "Web search failed." };
  }
}

module.exports = {
  isConfigured,
  tools: [
    {
      toolSchema: {
        name: "web_search",
        description:
          "Search the open web (not a single URL you already have) and get back ranked results with title, URL, and " +
          "snippet for each. Use this when Prathmesh asks about something current, something you're not confident " +
          "about, or anything you'd otherwise have to guess at — then use web_fetch on a promising result if he needs " +
          "the full page. Don't use this for things you already know cold.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query." },
            count: { type: "integer", description: "Number of results to return (1-10). Defaults to 5." },
            freshness: {
              type: "string",
              enum: ["pd", "pw", "pm", "py"],
              description: "Optional recency filter: pd=past day, pw=past week, pm=past month, py=past year. Omit for no filter.",
            },
          },
          required: ["query"],
        },
      },
      execute: webSearch,
    },
  ],
};
