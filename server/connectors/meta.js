const GRAPH_VERSION = "v21.0";

function igConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);
}
function adsConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

const IG_NOT_CONFIGURED = "Instagram isn't connected yet. Prathmesh needs to set META_ACCESS_TOKEN and META_IG_USER_ID in server/.env (see CONNECTORS.md).";
const ADS_NOT_CONFIGURED = "Meta Ads isn't connected yet. Prathmesh needs to set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in server/.env (see CONNECTORS.md).";

async function instagramInsights({ metric, period }) {
  if (!igConfigured()) return { error: IG_NOT_CONFIGURED };

  const metrics = metric || "impressions,reach,profile_views";
  const p = period || "day";

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.META_IG_USER_ID}/insights?metric=${encodeURIComponent(metrics)}&period=${encodeURIComponent(p)}&access_token=${process.env.META_ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || "Instagram Insights request failed." };

    const results = (data.data || []).map((m) => ({
      name: m.name,
      period: m.period,
      values: m.values,
    }));
    return { insights: results };
  } catch (err) {
    return { error: err.message || "Instagram Insights request failed." };
  }
}

// Read-only spend/performance summary. Actually creating or modifying ad
// spend is intentionally NOT exposed here — that needs an explicit
// confirm-before-execute flow per PLAN.md, not a tool an LLM can call freely.
async function adsSummary({ datePreset }) {
  if (!adsConfigured()) return { error: ADS_NOT_CONFIGURED };

  const preset = datePreset || "last_7d";

  try {
    const fields = "spend,impressions,clicks,cpc,ctr,reach";
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${process.env.META_AD_ACCOUNT_ID}/insights?fields=${fields}&date_preset=${encodeURIComponent(preset)}&access_token=${process.env.META_ACCESS_TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || "Meta Ads request failed." };
    return { summary: (data.data || [])[0] || { note: "No data for this date range." } };
  } catch (err) {
    return { error: err.message || "Meta Ads request failed." };
  }
}

module.exports = [
  {
    toolSchema: {
      name: "instagram_insights",
      description: "Get Prathmesh's Instagram Business account insights (impressions, reach, profile views, etc.), read-only.",
      input_schema: {
        type: "object",
        properties: {
          metric: { type: "string", description: "Comma-separated Graph API metric names. Defaults to 'impressions,reach,profile_views'." },
          period: { type: "string", description: "day | week | days_28. Defaults to 'day'." },
        },
      },
    },
    execute: instagramInsights,
  },
  {
    toolSchema: {
      name: "ads_summary",
      description: "Read-only summary of Prathmesh's Meta Ads account performance (spend, impressions, clicks, CPC, CTR). Cannot create or modify ads or spend.",
      input_schema: {
        type: "object",
        properties: {
          datePreset: { type: "string", description: "Meta date preset, e.g. 'today', 'last_7d', 'last_30d'. Defaults to 'last_7d'." },
        },
      },
    },
    execute: adsSummary,
  },
];
