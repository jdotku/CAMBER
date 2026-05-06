// ============================================================
// scenarioEngine.js — Scenario Simulation Engine (Phase 8)
//
// Scenario simulation helps PMs plan for disruptions BEFORE they happen.
// Instead of reacting to a Taiwan Strait escalation, a PM can model it
// in advance, see which parts go critical, and pre-qualify suppliers.
// ============================================================

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

let anthropic = null;
const hasAnthropicKey = (
  process.env.ANTHROPIC_API_KEY &&
  process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here'
);
if (hasAnthropicKey) {
  anthropic = new Anthropic();
}

// Default lead time when a part has no lead_time field (weeks)
const DEFAULT_LEAD_TIME = 8;

// Risk/cost/lead-time multipliers per scenario type.
// affectsAll = true means the scenario hits every part regardless of region.
const SCENARIO_DEFAULTS = {
  geopolitical_escalation: { riskMult: 1.5, costMult: 1.0,  leadMult: 1.0, riskAdder: 0,   affectsAll: false },
  natural_disaster:         { riskMult: 2.0, costMult: 1.0,  leadMult: 1.5, riskAdder: 0,   affectsAll: false },
  supply_shortage:          { riskMult: 1.2, costMult: 1.1,  leadMult: 1.3, riskAdder: 0,   affectsAll: true  },
  port_closure:             { riskMult: 1.8, costMult: 1.0,  leadMult: 2.0, riskAdder: 0,   affectsAll: false },
  tariff_war:               { riskMult: 1.0, costMult: 1.15, leadMult: 1.0, riskAdder: 0.5, affectsAll: false },
};

// ============================================================
// HELPERS
// ============================================================

// Flexible region match: "East Asia" matches "East Asia" and vice versa.
// Case-insensitive, handles partial overlaps.
function regionMatches(partRegion, affectedRegions) {
  if (!affectedRegions || affectedRegions.length === 0) return false;
  const lower = (partRegion || '').toLowerCase();
  return affectedRegions.some(r => {
    const rLower = r.toLowerCase();
    return lower.includes(rLower) || rLower.includes(lower);
  });
}

function getLeadTime(part) {
  return parseFloat(part.lead_time) || DEFAULT_LEAD_TIME;
}

// Compute aggregate metrics from a set of parts using the given field names.
function computeMetrics(parts, costField, riskField, leadField) {
  const n = parts.length;
  if (n === 0) return { high_risk_count: 0, avg_risk: 0, total_cost: 0, avg_lead_time: DEFAULT_LEAD_TIME };

  const totalCost = parts.reduce((sum, p) => {
    const cost = parseFloat(p[costField] !== undefined ? p[costField] : p.unit_cost) || 0;
    const qty  = parseFloat(p.quantity) || 1;
    return sum + cost * qty;
  }, 0);

  const avgRisk = parts.reduce((s, p) => {
    const r = p[riskField] !== undefined ? p[riskField] : p.risk_score;
    return s + (parseFloat(r) || 0);
  }, 0) / n;

  const highRiskCount = parts.filter(p => {
    const r = p[riskField] !== undefined ? p[riskField] : p.risk_score;
    return parseFloat(r) > 6;
  }).length;

  const avgLead = leadField
    ? parts.reduce((s, p) => s + (parseFloat(p[leadField]) || DEFAULT_LEAD_TIME), 0) / n
    : DEFAULT_LEAD_TIME;

  return {
    high_risk_count: highRiskCount,
    avg_risk:        Math.round(avgRisk * 10) / 10,
    total_cost:      Math.round(totalCost * 100) / 100,
    avg_lead_time:   Math.round(avgLead * 10) / 10,
  };
}

// ============================================================
// FUNCTION: simulateScenario(bomData, scenario)
//
// Applies a disruption scenario to the BOM and returns a
// side-by-side comparison of original vs scenario metrics.
// ============================================================
async function simulateScenario(bomData, scenario) {
  const {
    type,
    regions = [],
    severityMultiplier,
    costMultiplier: customCostMult,
  } = scenario;

  const defaults  = SCENARIO_DEFAULTS[type] || SCENARIO_DEFAULTS.geopolitical_escalation;
  const riskMult  = severityMultiplier || defaults.riskMult;
  const costMult  = customCostMult     || defaults.costMult;
  const leadMult  = defaults.leadMult;
  const riskAdder = defaults.riskAdder || 0;
  const affectsAll = defaults.affectsAll;

  // Apply scenario multipliers to each part
  const simulatedParts = bomData.map(part => {
    const baseLead = getLeadTime(part);
    const baseRisk = parseFloat(part.risk_score) || 5;
    const baseCost = parseFloat(part.unit_cost)  || 0;

    const isAffected = affectsAll || regionMatches(part.risk_region, regions);

    if (isAffected) {
      const newRisk = Math.min(10, Math.max(1, baseRisk * riskMult + riskAdder));
      return {
        ...part,
        scenario_risk_score: Math.round(newRisk * 10) / 10,
        scenario_lead_time:  Math.round(baseLead * leadMult * 10) / 10,
        scenario_cost:       Math.round(baseCost * costMult * 100) / 100,
        is_affected:         true,
      };
    }

    return {
      ...part,
      scenario_risk_score: baseRisk,
      scenario_lead_time:  baseLead,
      scenario_cost:       baseCost,
      is_affected:         false,
    };
  });

  const affectedParts   = simulatedParts.filter(p => p.is_affected);
  const originalMetrics = computeMetrics(bomData,        'unit_cost',          'risk_score',          null);
  const scenarioMetrics = computeMetrics(simulatedParts, 'scenario_cost',      'scenario_risk_score', 'scenario_lead_time');

  const riskChange    = scenarioMetrics.avg_risk - originalMetrics.avg_risk;
  const riskChangePct = originalMetrics.avg_risk > 0
    ? Math.round((riskChange / originalMetrics.avg_risk) * 100)
    : 0;
  const costImpact = scenarioMetrics.total_cost - originalMetrics.total_cost;

  const result = {
    scenario_type:    type,
    affected_regions: regions,
    original_metrics: originalMetrics,
    scenario_metrics: scenarioMetrics,
    impact_summary:   `In a ${type.replace(/_/g, ' ')}, supply chain risk increases by ${riskChangePct}%, affecting ${affectedParts.length} of ${bomData.length} parts.`,
    affected_parts:   affectedParts,
    cost_impact:      Math.round(costImpact * 100) / 100,
    recommendation:   null,
  };

  result.recommendation = await generateScenarioRecommendations(result);
  return result;
}

// ============================================================
// FUNCTION: generateScenarioRecommendations(scenarioResult)
//
// Uses Claude to turn simulation numbers into actionable steps.
// Falls back to a template-based response if Claude is unavailable.
// ============================================================
async function generateScenarioRecommendations(scenarioResult) {
  const { scenario_type, original_metrics, scenario_metrics, affected_parts, cost_impact } = scenarioResult;

  const criticalCount  = affected_parts.filter(p => p.scenario_risk_score > 7).length;
  const affectedNames  = affected_parts.slice(0, 5).map(p => p.part_name).join(', ');
  const costFormatted  = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.abs(cost_impact));

  const fallback = criticalCount > 0
    ? `If a ${scenario_type.replace(/_/g, ' ')} occurs, ${criticalCount} part(s) would reach critical risk. ` +
      `Estimated cost impact: ${costFormatted}. ` +
      `Recommended: Qualify secondary suppliers in geopolitically stable regions, ` +
      `increase safety stock for affected parts (${affectedNames}), ` +
      `and review contracts for force majeure clauses.`
    : `The ${scenario_type.replace(/_/g, ' ')} scenario has limited impact on your supply chain. ` +
      `Maintain current contingency plans and continue monitoring.`;

  if (!anthropic) return fallback;

  const prompt = `A supply chain scenario simulation produces these results:

Scenario: ${scenario_type.replace(/_/g, ' ')}
Affected parts (${affected_parts.length}): ${affectedNames}${affected_parts.length > 5 ? `, +${affected_parts.length - 5} more` : ''}
Avg risk: ${original_metrics.avg_risk}/10 → ${scenario_metrics.avg_risk}/10
High-risk count: ${original_metrics.high_risk_count} → ${scenario_metrics.high_risk_count}
Cost impact: ${costFormatted}
Parts at critical risk (>7): ${criticalCount}

Give a product manager 3 prioritized mitigation actions. Format exactly as:
1. [QUICK WIN] Action — timeline
2. [STRATEGIC] Action — timeline
3. [CONTINGENCY] Action — timeline
Under 150 words.`;

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 300,
      messages:   [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text?.trim() || fallback;
  } catch (err) {
    console.warn(`  [scenario engine fallback]: ${err.message}`);
    return fallback;
  }
}

module.exports = { simulateScenario, generateScenarioRecommendations };
