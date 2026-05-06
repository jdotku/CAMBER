const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const analysisCache  = {};
const partCache      = {};
const networkCache   = {};

// ---- Helpers ----

function getCacheKey(bomData) {
  return [...bomData]
    .sort((a, b) => (a.part_id || a.part_name || '').localeCompare(b.part_id || b.part_name || ''))
    .map(p => `${p.part_id || p.part_name}:${(p.risk_score || 0).toFixed(1)}`)
    .join('|');
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

function setCache(store, key, value, ttlMs = 3_600_000) {
  store[key] = value;
  setTimeout(() => delete store[key], ttlMs);
}

function buildBOMSummary(bomData) {
  const highRisk = bomData.filter(p => p.risk_level === 'High');
  const medRisk  = bomData.filter(p => p.risk_level === 'Medium');
  const avgRisk  = bomData.reduce((s, p) => s + (p.risk_score || 0), 0) / bomData.length;

  const mfgCounts = bomData.reduce((acc, p) => {
    acc[p.manufacturer] = (acc[p.manufacturer] || 0) + 1; return acc;
  }, {});
  const countryCounts = bomData.reduce((acc, p) => {
    const c = p.country || 'Unknown'; acc[c] = (acc[c] || 0) + 1; return acc;
  }, {});

  const topMfg       = Object.entries(mfgCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  let summary = `BOM Summary:
- Total parts: ${bomData.length}
- Avg risk score: ${avgRisk.toFixed(1)}/10
- High risk: ${highRisk.length} parts, Medium: ${medRisk.length} parts
- Top manufacturers: ${topMfg.map(([m, c]) => `${m} (${c})`).join(', ')}
- Geographic spread: ${topCountries.map(([c, n]) => `${c} (${n})`).join(', ')}`;

  if (highRisk.length > 0) {
    const topHigh = highRisk.slice(0, 4).map(
      p => `${p.part_name} @ ${p.manufacturer} (${(p.risk_score || 0).toFixed(1)})`
    );
    summary += `\n- High-risk parts: ${topHigh.join('; ')}`;
  }

  const recentEvents = [...new Set(
    bomData.flatMap(p => p.recent_events || []).filter(Boolean)
  )].slice(0, 4);
  if (recentEvents.length > 0) {
    summary += `\n- Recent events: ${recentEvents.join('; ')}`;
  }

  return summary;
}

// ---- BOM-level analysis (Simple Dashboard) ----

async function analyzeAndExplain(bomData, baseHealthScore) {
  const cacheKey = getCacheKey(bomData);
  if (analysisCache[cacheKey]) return analysisCache[cacheKey];

  try {
    const bomSummary = buildBOMSummary(bomData);

    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are a supply chain risk analyst. Analyze this Bill of Materials and respond with ONLY valid JSON — no markdown, no prose.

${bomSummary}
Overall health: ${baseHealthScore}

JSON schema (exact keys required):
{
  "explanation": "2-3 sentences explaining the health status and primary risk drivers",
  "recommendation": "The single most impactful action to improve resilience",
  "warning": "The biggest immediate threat (null if none)",
  "confidence": <float 0.0-1.0 representing your confidence in this analysis>
}`,
      }],
    });

    const rawText = message.content.find(b => b.type === 'text')?.text || '';
    const result  = parseJSON(rawText);

    setCache(analysisCache, cacheKey, result);
    return result;
  } catch (err) {
    console.error('claudeAnalyzer.analyzeAndExplain error:', err.message);
    return getFallbackAnalysis(baseHealthScore);
  }
}

function getFallbackAnalysis(baseHealthScore) {
  const fallbacks = {
    Green: {
      explanation:    'Your supply chain is well-diversified with low risk exposure across manufacturers and regions.',
      recommendation: 'Continue monitoring geopolitical developments in key supplier regions.',
      warning:        null,
      confidence:     0.3,
    },
    Yellow: {
      explanation:    'Moderate supply chain risk detected. Some supplier concentration or geographic exposure needs attention.',
      recommendation: 'Identify alternative suppliers for your top 2-3 highest-risk components.',
      warning:        'Supplier concentration increases your vulnerability to regional disruptions.',
      confidence:     0.3,
    },
    Red: {
      explanation:    'Significant supply chain risks detected. High concentration or high-risk suppliers require immediate attention.',
      recommendation: 'Urgently source alternative suppliers for high-risk components and diversify geographic exposure.',
      warning:        'Current supply chain configuration poses a significant disruption risk.',
      confidence:     0.3,
    },
  };
  return fallbacks[baseHealthScore] || fallbacks.Yellow;
}

// ---- Part-level analysis (Deep Mode — Risk & Alternatives tab) ----

async function analyzePartContext(part, allParts) {
  const cacheKey = `part:${part.part_id || part.part_name}:${(part.risk_score || 0).toFixed(1)}`;
  if (partCache[cacheKey]) return partCache[cacheKey];

  const relevantParts = allParts.filter(p => p.country === part.country);
  const newsEvents    = part.recent_events || [];

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a supply chain analyst. A user selected this part for deeper analysis.

PART: ${part.part_name}
MANUFACTURER: ${part.manufacturer}
COUNTRY: ${part.country}
RISK SCORE: ${(part.risk_score || 0).toFixed(1)}/10
OTHER PARTS FROM SAME REGION: ${relevantParts.length}

RECENT NEWS AFFECTING THIS REGION:
${newsEvents.length > 0 ? newsEvents.map(e => `- ${e}`).join('\n') : '- No recent events'}

Respond with ONLY valid JSON — no markdown, no prose:
{
  "context": "2-3 sentences explaining this part's specific risks",
  "newsTrails": [{"impact": "HIGH"|"MEDIUM"|"LOW", "headline": "..."}],
  "recommendation": "1 sentence on how to mitigate this specific risk"
}

If there are no news events, set newsTrails to an empty array.`,
      }],
    });

    const rawText = message.content.find(b => b.type === 'text')?.text || '';
    const result  = parseJSON(rawText);

    setCache(partCache, cacheKey, result, 3_600_000);
    return result;
  } catch (err) {
    console.error('claudeAnalyzer.analyzePartContext error:', err.message);
    return {
      context:        `${part.part_name} carries supply chain risk due to its geographic location and manufacturer concentration.`,
      newsTrails:     [],
      recommendation: `Consider qualifying an alternative supplier for ${part.part_name}.`,
    };
  }
}

// ---- Network-level analysis (Deep Mode — Supply Network tab) ----

async function analyzeNetworkContext(bomData) {
  const cacheKey = getCacheKey(bomData);
  if (networkCache[cacheKey]) return networkCache[cacheKey];

  const mfgCounts = bomData.reduce((acc, p) => {
    acc[p.manufacturer] = (acc[p.manufacturer] || 0) + 1; return acc;
  }, {});
  const regionCounts = bomData.reduce((acc, p) => {
    const c = p.country || 'Unknown'; acc[c] = (acc[c] || 0) + 1; return acc;
  }, {});

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a supply chain strategy advisor analyzing this company's supplier network.

MANUFACTURERS:
${Object.entries(mfgCounts).map(([mfg, count]) => `- ${mfg}: ${count} parts`).join('\n')}

GEOGRAPHIC DISTRIBUTION:
${Object.entries(regionCounts).map(([country, count]) => `- ${country}: ${count} parts`).join('\n')}

Respond with ONLY valid JSON — no markdown, no prose:
{
  "context": "2 sentences about network health and concentration risks",
  "recommendation": "Specific regions or suppliers to add for resilience"
}`,
      }],
    });

    const rawText = message.content.find(b => b.type === 'text')?.text || '';
    const result  = parseJSON(rawText);

    setCache(networkCache, cacheKey, result, 3_600_000);
    return result;
  } catch (err) {
    console.error('claudeAnalyzer.analyzeNetworkContext error:', err.message);
    return {
      context:        'Your supply network shows concentration risks that require attention.',
      recommendation: 'Diversify suppliers across multiple geographic regions to reduce single-point-of-failure risk.',
    };
  }
}

module.exports = { analyzeAndExplain, analyzePartContext, analyzeNetworkContext };
