function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function webFetch({ url }) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { error: "A valid http(s) URL is required." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);
    if (!res.ok) return { error: `Request failed with status ${res.status}.` };

    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();
    const text = contentType.includes("html") ? stripHtml(raw) : raw;
    const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);

    return {
      url,
      title: titleMatch ? titleMatch[1].trim() : "",
      content: text.slice(0, 4000),
      truncated: text.length > 4000,
    };
  } catch (err) {
    clearTimeout(timeout);
    return { error: err.name === "AbortError" ? "Request timed out." : err.message || "Fetch failed." };
  }
}

module.exports = [
  {
    toolSchema: {
      name: "web_fetch",
      description: "Fetch a URL and return its page title and readable text content (HTML stripped, truncated to ~4000 characters). Read-only lookup — cannot click, log in, or interact with a page.",
      input_schema: {
        type: "object",
        properties: { url: { type: "string", description: "Full http(s) URL to fetch." } },
        required: ["url"],
      },
    },
    execute: webFetch,
  },
];
