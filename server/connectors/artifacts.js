// Lets Atlas hand back a real file — a script, a config, a small document —
// instead of just pasting code into the chat text. The content still streams
// to the client via `emit` (same reasoning as chart_dataset: the model
// doesn't need its own giant string echoed back into context to talk about
// what it made), but unlike a chart it's also kept server-side for a few
// hours so the "⬇ DOWNLOAD" button in the UI has something to fetch as a
// real file with the right name and extension — a markdown code fence alone
// can't do that.
//
// In-memory only, matching memory.json/Prism's "ephemeral within a
// deployment" posture — an artifact is meant to be downloaded promptly, not
// archived. Capped and TTL'd so a long session can't leak memory.

const MAX_ARTIFACTS = 50;
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — long enough to notice and download, short enough not to matter

const store = new Map(); // id -> { filename, content, mimeType, createdAt }
let seq = 0;

const EXT_MIME = {
  py: "text/x-python", js: "text/javascript", ts: "text/typescript", jsx: "text/javascript",
  tsx: "text/typescript", html: "text/html", css: "text/css", json: "application/json",
  md: "text/markdown", txt: "text/plain", sh: "text/x-sh", sql: "text/x-sql",
  yaml: "text/yaml", yml: "text/yaml", csv: "text/csv", xml: "application/xml",
  java: "text/x-java", c: "text/x-c", cpp: "text/x-c++", go: "text/x-go", rs: "text/x-rust",
};

function mimeFor(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || "text/plain";
}

function sweepExpired() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, a] of store) {
    if (a.createdAt < cutoff) store.delete(id);
  }
}

function sanitizeFilename(name) {
  // Strip any directory components and anything that isn't a normal
  // filename character — this is served back over HTTP, so no path
  // traversal, no leading dot-slash tricks.
  const base = String(name).split(/[/\\]/).pop() || "artifact.txt";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || "artifact.txt";
}

async function createArtifact({ filename, content, description }, emit) {
  if (!filename || !filename.trim()) return { error: "filename is required." };
  if (typeof content !== "string" || !content.trim()) return { error: "content is required and must be non-empty text." };
  if (content.length > 300000) return { error: "Content too large (300KB text limit) — split it into smaller files." };

  sweepExpired();
  if (store.size >= MAX_ARTIFACTS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) store.delete(oldest[0]);
  }

  const safeFilename = sanitizeFilename(filename);
  const id = `art_${Date.now()}_${++seq}`;
  const mimeType = mimeFor(safeFilename);
  store.set(id, { filename: safeFilename, content, mimeType, createdAt: Date.now() });

  if (emit) {
    emit("artifact", {
      id,
      filename: safeFilename,
      language: (safeFilename.split(".").pop() || "").toLowerCase(),
      content,
      description: description || "",
      lines: content.split("\n").length,
    });
  }

  return {
    artifactCreated: true,
    filename: safeFilename,
    note: "Shown to Prathmesh directly with a download button — don't repeat the full content back in your reply, just briefly say what it does and how to use it.",
  };
}

function getArtifact(id) {
  sweepExpired();
  return store.get(id) || null;
}

module.exports = {
  getArtifact,
  tools: [
    {
      toolSchema: {
        name: "create_artifact",
        description:
          "Hand Prathmesh back a real file — a script, a config, a small doc, anything he can download and run/use " +
          "directly — instead of just putting code in your chat reply. Use this whenever he asks you to write, build, " +
          "or generate something substantial (a script, a tool, structured data, a document), not for a two-line " +
          "snippet that's easier to just show inline. He gets a download button; you get a short confirmation back, " +
          "so don't paste the content again in your own reply.",
        input_schema: {
          type: "object",
          properties: {
            filename: { type: "string", description: "Filename with extension, e.g. 'scrape_prices.py' or 'notes.md'." },
            content: { type: "string", description: "The full file content, exactly as it should be saved." },
            description: { type: "string", description: "One short sentence on what it does or how to run it. Optional." },
          },
          required: ["filename", "content"],
        },
      },
      execute: createArtifact,
    },
  ],
};
