const NOT_CONFIGURED =
  "Web search isn't connected yet. Prathmesh needs to set BRAVE_SEARCH_API_KEY in server/.env (see CONNECTORS.md) — " +
  "web_fetch still works for a URL he already has, but open search needs this.";

function isConfigured() {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

async function webSearch({ query, count, freshness }) {
  if (!isConfigured()) return { error: NOT_CONFIGURED };
  if (!query || !query.trim()) return { error: "query is required." };

  const limit = Math.min(10, Math.max(1, parseInt(count, 10) || 5));
  const params = new URLSearchParams({ q: query.trim(), count: String(limit) });
  // Brave's freshness filter: pd=past day, pw=past week, pm=past month, py=past year.
  if (freshness && ["pd", "pw", "pm", "py"].includes(freshness)) {
    params.set("freshness", freshness);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { error: "Brave Search rejected the API key — check BRAVE_SEARCH_API_KEY in server/.env." };
      }
      if (res.status === 429) {
        return { error: "Brave Search rate limit hit — the free tier caps requests per second/month. Try again shortly." };
      }
      return { error: `Web search failed with status ${res.status}.` };
    }

    const data = await res.json();
    const results = (data.web?.results || []).slice(0, limit).map((r) => ({
      title: r.title || "",
      url: r.url,
      snippet: (r.description || "").replace(/<\/?strong>/g, ""),
      age: r.age || undefined,
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
