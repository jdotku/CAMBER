// ============================================================
// claudeRecommender.js — AI-Powered Recommendation Engine
//
// Phase 6 update: adds structured prompt format (executive
// summary + risk bullets + actions + alternatives + lead time),
// a separate generateSupplierAlternatives() call, and exports
// recommendation_type so the frontend can show an AI badge.
//
// Key design decisions:
//   1. PROMPT CACHING: system prompt marked cache_control so
//      Anthropic caches it server-side for 5 minutes.
//   2. IN-MEMORY CACHE: same part + risk level = skip the API call.
//   3. GRACEFUL FALLBACK: any failure returns rule-based text silently.
// ============================================================

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const { generateRecommendation } = require('./riskCalculator');

let anthropic = null;
const hasAnthropicKey = (
  process.env.ANTHROPIC_API_KEY &&
  process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here'
);

if (hasAnthropicKey) {
  anthropic = new Anthropic();
  const masked = process.env.ANTHROPIC_API_KEY.slice(0, 14) + '...';
  console.log(`✓ Anthropic Claude ready — key: ${masked}`);
} else {
  console.log('ℹ ANTHROPIC_API_KEY not set — using rule-based recommendations');
}

// ============================================================
// SYSTEM PROMPT (cached server-side by Anthropic for 5 minutes)
// ============================================================
const SYSTEM_PROMPT = `You are a supply chain risk analyst for a hardware manufacturer. Analyze semiconductor components and provide structured risk assessments.

Your response must follow this exact format (no extra text before or after):

EXECUTIVE SUMMARY: [1 sentence stating the overall risk and most urgent concern]

PRIMARY RISKS:
• [Risk 1 — specific, references actual news or data]
• [Risk 2 — specific]
• [Risk 3 — specific, omit if fewer than 3 genuine risks]

RECOMMENDED ACTIONS:
• [Action 1 — concrete, with timeline in weeks or quarters]
• [Action 2 — concrete]
• [Action 3 — concrete, omit if fewer than 3 genuine actions]

ALTERNATIVE SUPPLIERS: [2-3 regions in format "Region (Lead Time, Relative Cost)" separated by commas]

LEAD TIME IMPACT: [1 sentence estimating delay if primary supplier disrupted]

Rules:
- Under 200 words total
- Reference actual news events or keywords provided
- Name specific regions (EU, USA, Southeast Asia, Mexico) not vague "diversify"
- Timelines must be concrete: "within 6 weeks" not "soon"
- Risk score context: 1–3 stable, 4–6 monitor, 7–10 act now`;

// ============================================================
// IN-MEMORY CACHES
// ============================================================
const recommendationCache = new Map();
const alternativesCache   = new Map();

function buildCacheKey(part, riskScore) {
  return `${part.part_name}|${part.manufacturer}|${riskScore.risk_level}|${riskScore.raw_score}`;
}

// ============================================================
// HELPER: buildUserPrompt
// ============================================================
function buildUserPrompt(part, riskScore, countryRiskData) {
  const {
    part_name, part_number = '', manufacturer,
    country, risk_region, quantity, unit_cost,
  } = part;

  const { raw_score, risk_level, contributing_factors, recent_events, news_keywords } = riskScore;

  const lines = [
    'PART DETAILS:',
    `  Part: ${part_name}${part_number ? ` (${part_number})` : ''}`,
    `  Manufacturer: ${manufacturer} — ${country} (${risk_region})`,
    `  Quantity: ${quantity} units @ $${parseFloat(unit_cost || 0).toFixed(2)} each`,
    '',
    'RISK ASSESSMENT:',
    `  Risk Score: ${raw_score}/10 — ${risk_level} Risk`,
    '  Risk Drivers:',
    ...(contributing_factors || []).map(f => `    • ${f}`),
  ];

  if (news_keywords && news_keywords.length > 0) {
    const kwList = news_keywords.map(k => `${k.word} (${k.category})`).join(', ');
    lines.push('', `  Live News Keywords: ${kwList}`);
  }

  const events = (countryRiskData?.recent_news || recent_events || []).slice(0, 3);
  if (events.length > 0) {
    lines.push('', 'RECENT NEWS & EVENTS:');
    events.forEach(e => lines.push(`  "${e}"`));
  }

  lines.push('', 'TASK: Provide the structured risk assessment following the exact format in your instructions.');

  return lines.join('\n');
}

// ============================================================
// HELPER: parseStructuredResponse
//
// Pulls the ALTERNATIVE SUPPLIERS line out of the structured
// response so we can store it as a separate array.
// ============================================================
function parseStructuredResponse(text) {
  const altMatch = text.match(/ALTERNATIVE SUPPLIERS:\s*([^\n]+)/i);
  let alternatives = [];

  if (altMatch) {
    alternatives = altMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  return { fullText: text, alternatives };
}

// ============================================================
// MAIN FUNCTION: generateAIRecommendation
//
// Returns: { text, source, alternatives, recommendation_type }
//   source / recommendation_type: 'claude' | 'rule-based'
//   alternatives: string[] like ["Mexico (8 weeks, +10%)", ...]
// ============================================================
async function generateAIRecommendation(part, riskScore, countryRiskData) {
  if (!anthropic) {
    return {
      text:                generateRecommendation(part, riskScore),
      source:              'rule-based',
      recommendation_type: 'rule-based',
      alternatives:        [],
    };
  }

  const cacheKey = buildCacheKey(part, riskScore);
  if (recommendationCache.has(cacheKey)) {
    return recommendationCache.get(cacheKey);
  }

  try {
    const userPrompt = buildUserPrompt(part, riskScore, countryRiskData);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const rawText = response.content[0]?.text?.trim();
    if (!rawText) throw new Error('Claude returned an empty response');

    const usage = response.usage;
    console.log(
      `  [claude] ${part.part_name}: ` +
      `${usage.input_tokens} in / ${usage.output_tokens} out` +
      (usage.cache_read_input_tokens ? ` / ${usage.cache_read_input_tokens} cached` : '')
    );

    const { fullText, alternatives } = parseStructuredResponse(rawText);

    const result = {
      text:                fullText,
      source:              'claude',
      recommendation_type: 'claude',
      alternatives,
    };

    recommendationCache.set(cacheKey, result);
    return result;

  } catch (err) {
    console.warn(`  [claude fallback] ${part.part_name}: ${err.message}`);
    return {
      text:                generateRecommendation(part, riskScore),
      source:              'rule-based',
      recommendation_type: 'rule-based',
      alternatives:        [],
    };
  }
}

// ============================================================
// generateSupplierAlternatives
//
// Separate, lighter Claude call used by /api/explain-risk.
// Returns an array of alternative supplier strings.
// ============================================================
async function generateSupplierAlternatives(part, primaryRegion, newsData) {
  if (!anthropic) return [];

  const altKey = `${part.part_name}|${primaryRegion}`;
  if (alternativesCache.has(altKey)) return alternativesCache.get(altKey);

  const recentHeadlines = (newsData?.recent_news || []).slice(0, 2)
    .map(h => `"${h}"`).join('\n');

  const prompt = [
    `A semiconductor part (${part.part_name}) manufactured in ${primaryRegion} is at supply chain risk.`,
    recentHeadlines ? `Recent regional news:\n${recentHeadlines}` : '',
    '',
    'Suggest 2-3 alternative supplier regions that are geopolitically stable and have semiconductor manufacturing capacity.',
    'Format each alternative exactly as: "Region (Lead Time, Relative Cost)"',
    'Example: "Mexico (6 weeks, +8%)"',
    'Return only the comma-separated list, nothing else.',
  ].filter(Boolean).join('\n');

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text?.trim() || '';
    const alternatives = raw.split(',').map(s => s.trim()).filter(Boolean);
    alternativesCache.set(altKey, alternatives);
    return alternatives;

  } catch (err) {
    console.warn(`  [claude alt fallback] ${part.part_name}: ${err.message}`);
    return [];
  }
}

// ============================================================
// generateDeepExplanation
//
// Used by POST /api/explain-risk — longer, prose explanation
// of why a specific part carries the risk it does.
// ============================================================
async function generateDeepExplanation(part, riskScore, countryRiskData) {
  if (!anthropic) {
    return generateRecommendation(part, riskScore);
  }

  const { raw_score, risk_level, contributing_factors, news_keywords } = riskScore;
  const events = (countryRiskData?.recent_news || []).slice(0, 5);

  const kwList = (news_keywords || []).map(k => `${k.word} (${k.category})`).join(', ');

  const prompt = [
    `Explain in detail why ${part.part_name} from ${part.manufacturer} in ${part.country} has a risk score of ${raw_score}/10 (${risk_level} Risk).`,
    '',
    'Contributing factors:',
    ...(contributing_factors || []).map(f => `  • ${f}`),
    kwList ? `\nDetected news keywords: ${kwList}` : '',
    events.length ? `\nRecent headlines:\n${events.map(e => `  "${e}"`).join('\n')}` : '',
    '',
    'Explain the compounding effect of these factors, what scenarios could worsen the risk, and what early warning signals a PM should watch for. Use plain prose, under 250 words.',
  ].filter(s => s !== undefined).join('\n');

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.text?.trim() || generateRecommendation(part, riskScore);

  } catch (err) {
    console.warn(`  [claude explain fallback] ${part.part_name}: ${err.message}`);
    return generateRecommendation(part, riskScore);
  }
}

function getRecommenderStatus() {
  return {
    enabled:    hasAnthropicKey,
    cache_size: recommendationCache.size,
    model:      'claude-sonnet-4-6',
  };
}

function clearRecommendationCache() {
  recommendationCache.clear();
  alternativesCache.clear();
}

module.exports = {
  generateAIRecommendation,
  generateSupplierAlternatives,
  generateDeepExplanation,
  getRecommenderStatus,
  clearRecommendationCache,
};
