// Bridges Atlas to Prism's analysis API (a separate service — see
// PRISM_API_URL). Rather than pass a dataset id through every tool call
// (fragile for the model to track correctly across turns), Atlas keeps a
// single "currently loaded dataset" pointer server-side, set by the
// /api/prism/upload route in server.js when the user uploads a file through
// the UI. Every tool below just operates on whatever's currently loaded —
// matching how Prism's own Streamlit app treats one "active dataset" at a
// time.

let current = null; // { datasetId, name, rows, columns }

function setCurrentDataset(info) {
  current = info;
}

function getCurrentDataset() {
  return current;
}

function isConfigured() {
  return Boolean(process.env.PRISM_API_URL);
}

const NOT_CONFIGURED = "Prism isn't connected yet. Prathmesh needs to set PRISM_API_URL in server/.env (see CONNECTORS.md).";
const NO_DATASET = "No dataset is loaded yet. Ask Prathmesh to upload a CSV or Excel file using the 📊 button first.";

async function prismFetch(path, options) {
  const base = process.env.PRISM_API_URL.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `Prism API returned ${res.status}.`);
  return data;
}

async function datasetSummary() {
  if (!isConfigured()) return { error: NOT_CONFIGURED };
  if (!current) return { error: NO_DATASET };
  try {
    return await prismFetch(`/summary/${current.datasetId}`);
  } catch (err) {
    return { error: err.message || "Prism request failed." };
  }
}

async function profileDataset() {
  if (!isConfigured()) return { error: NOT_CONFIGURED };
  if (!current) return { error: NO_DATASET };
  try {
    return await prismFetch(`/profile/${current.datasetId}`);
  } catch (err) {
    return { error: err.message || "Prism request failed." };
  }
}

async function queryDataset({ sql }) {
  if (!isConfigured()) return { error: NOT_CONFIGURED };
  if (!current) return { error: NO_DATASET };
  if (!sql) return { error: "sql is required." };
  try {
    return await prismFetch(`/sql/${current.datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
  } catch (err) {
    return { error: err.message || "Prism request failed." };
  }
}

// The chart image itself is streamed straight to the client via `emit` —
// never through the model's own text context, which would otherwise burn
// enormous tokens repeating base64 image data back and forth for no benefit
// (the model can't "see" the pixels anyway). The model just gets a small
// confirmation to talk about.
async function chartDataset({ column }, emit) {
  if (!isConfigured()) return { error: NOT_CONFIGURED };
  if (!current) return { error: NO_DATASET };
  if (!column) return { error: "column is required." };
  try {
    const data = await prismFetch(`/chart/${current.datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column }),
    });
    if (emit) emit("image", { dataUri: data.image, alt: `Chart of ${column}` });
    return { chartGenerated: true, column };
  } catch (err) {
    return { error: err.message || "Prism request failed." };
  }
}

module.exports = {
  setCurrentDataset,
  getCurrentDataset,
  isConfigured,
  tools: [
    {
      toolSchema: {
        name: "dataset_summary",
        description: "Get a quick summary of the currently loaded dataset: row/column counts, column names and types, missing data %, and a sample of rows. Use this first when Prathmesh asks about 'my data' or 'the file I uploaded'.",
        input_schema: { type: "object", properties: {} },
      },
      execute: datasetSummary,
    },
    {
      toolSchema: {
        name: "profile_dataset",
        description: "Get the full data quality report for the currently loaded dataset: missing values, duplicates, outliers, and per-column health (skew, near-constant, ID-like columns, etc).",
        input_schema: { type: "object", properties: {} },
      },
      execute: profileDataset,
    },
    {
      toolSchema: {
        name: "query_dataset",
        description: "Run a SQL query against the currently loaded dataset (DuckDB syntax). The table is always named `data`. Use this to answer specific questions like totals, filters, group-bys, and rankings instead of guessing.",
        input_schema: {
          type: "object",
          properties: { sql: { type: "string", description: "SQL query, e.g. SELECT region, SUM(revenue) FROM data GROUP BY region" } },
          required: ["sql"],
        },
      },
      execute: queryDataset,
    },
    {
      toolSchema: {
        name: "chart_dataset",
        description: "Generate and show a chart for one column of the currently loaded dataset (histogram for numeric, bar chart of top values for categorical, trend line for datetime). The image is shown directly to Prathmesh — just briefly describe what you generated.",
        input_schema: {
          type: "object",
          properties: { column: { type: "string", description: "Exact column name to chart." } },
          required: ["column"],
        },
      },
      execute: chartDataset,
    },
  ],
};
