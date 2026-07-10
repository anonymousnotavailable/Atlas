const NOT_CONFIGURED = "RevenueCat isn't connected yet. Prathmesh needs to set REVENUECAT_API_KEY and REVENUECAT_PROJECT_ID in server/.env (see CONNECTORS.md).";

function configured() {
  return Boolean(process.env.REVENUECAT_API_KEY && process.env.REVENUECAT_PROJECT_ID);
}

async function revenueSummary() {
  if (!configured()) return { error: NOT_CONFIGURED };

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${process.env.REVENUECAT_PROJECT_ID}/metrics`,
      { headers: { Authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` } }
    );
    const data = await res.json();
    if (!res.ok) return { error: data.message || "RevenueCat request failed." };

    const metrics = {};
    for (const m of data.metrics || []) {
      metrics[m.id] = { value: m.value, name: m.name, period: m.period };
    }
    return { metrics };
  } catch (err) {
    return { error: err.message || "RevenueCat request failed." };
  }
}

module.exports = [
  {
    toolSchema: {
      name: "revenue_summary",
      description: "Get Prathmesh's current RevenueCat revenue metrics: MRR, active trials, active subscriptions, and revenue.",
      input_schema: { type: "object", properties: {} },
    },
    execute: revenueSummary,
  },
];
