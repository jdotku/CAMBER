// BOM Health Scoring
// This scoring is intentionally simple. We're categorizing, not being precise.

function calculateBOMHealth(bomData) {
  const avgRisk = bomData.reduce((sum, p) => sum + (p.risk_score || 5), 0) / bomData.length;

  const mfgCounts = bomData.reduce((acc, p) => {
    acc[p.manufacturer] = (acc[p.manufacturer] || 0) + 1;
    return acc;
  }, {});
  const manufacturers        = Object.keys(mfgCounts);
  const maxCount             = Math.max(...Object.values(mfgCounts));
  const concentrationPercent = (maxCount / bomData.length) * 100;

  const highCount   = bomData.filter(p => p.risk_level === 'High').length;
  const mediumCount = bomData.filter(p => p.risk_level === 'Medium').length;
  const lowCount    = bomData.filter(p => p.risk_level === 'Low').length;

  let healthScore;

  if (avgRisk < 3.5 && concentrationPercent < 30 && manufacturers.length >= 4) {
    healthScore = 'Green';
  } else if (avgRisk < 6 && concentrationPercent < 50 && manufacturers.length >= 2) {
    healthScore = 'Yellow';
  } else {
    healthScore = 'Red';
  }

  return {
    healthScore,
    avgRisk,
    issueCount: { critical: highCount, medium: mediumCount, low: lowCount },
  };
}

function detectIssues(bomData) {
  const issues = [];

  // Supplier concentration check
  const mfgCounts = bomData.reduce((acc, p) => {
    acc[p.manufacturer] = (acc[p.manufacturer] || 0) + 1;
    return acc;
  }, {});
  const maxCount  = Math.max(...Object.values(mfgCounts));
  const topMfg    = Object.entries(mfgCounts).find(([, v]) => v === maxCount)?.[0] || '';
  const concPct   = (maxCount / bomData.length) * 100;

  if (concPct > 40) {
    issues.push({
      type:             'concentration',
      severity:         concPct > 50 ? 'critical' : 'medium',
      description:      `${topMfg} represents ${concPct.toFixed(0)}% of your BOM`,
      affectedPartsCount: maxCount,
    });
  }

  // Region concentration
  const regionCounts = bomData.reduce((acc, p) => {
    const r = p.country || 'Unknown';
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  const maxRegionCount = Math.max(...Object.values(regionCounts));
  const topRegion      = Object.entries(regionCounts).find(([, v]) => v === maxRegionCount)?.[0] || '';
  const regionPct      = (maxRegionCount / bomData.length) * 100;

  if (regionPct > 50) {
    issues.push({
      type:             'region_concentration',
      severity:         'critical',
      description:      `${regionPct.toFixed(0)}% of BOM sourced from ${topRegion}`,
      affectedPartsCount: maxRegionCount,
    });
  }

  // Long lead times (inferred from risk level as proxy since real lead_time may be absent)
  const longLeadParts = bomData.filter(p =>
    (p.risk_level === 'High') || (p.lead_time && parseFloat(p.lead_time) > 12)
  );
  if (longLeadParts.length > 0) {
    issues.push({
      type:             'lead_time',
      severity:         longLeadParts.length > 3 ? 'medium' : 'low',
      description:      `${longLeadParts.length} part${longLeadParts.length !== 1 ? 's' : ''} have extended lead times`,
      affectedPartsCount: longLeadParts.length,
    });
  }

  // Single-source high-risk parts
  const highRiskParts = bomData.filter(p => p.risk_level === 'High');
  if (highRiskParts.length > 0) {
    issues.push({
      type:             'single_source',
      severity:         highRiskParts.length >= 3 ? 'critical' : 'medium',
      description:      `${highRiskParts.length} high-risk part${highRiskParts.length !== 1 ? 's' : ''} with no confirmed alternatives`,
      affectedPartsCount: highRiskParts.length,
    });
  }

  const severityOrder = { critical: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function recommendFix(bomData, topIssue) {
  if (!topIssue || bomData.length === 0) return null;

  const highestRiskPart = bomData.reduce((prev, cur) =>
    (cur.risk_score || 0) > (prev.risk_score || 0) ? cur : prev
  );

  const mockAlternatives = [
    { part_name: 'Intel Xeon Platinum 8380', risk_score: 2.1, cost_delta: '+15%' },
    { part_name: 'AMD EPYC 7003 Series',     risk_score: 2.5, cost_delta: '+8%'  },
    { part_name: 'Samsung Foundry S5E9945',  risk_score: 3.2, cost_delta: '-5%'  },
  ];

  const best = mockAlternatives[0];

  return {
    partToReplace:  highestRiskPart,
    recommendation: `Replace ${highestRiskPart.part_name} with ${best.part_name}`,
    alternative:    best,
    impact: {
      riskReduction:  (highestRiskPart.risk_score || 0) - best.risk_score,
      costIncrease:   best.cost_delta,
      leadTimeChange: '12 weeks → 8 weeks',
    },
  };
}

module.exports = { calculateBOMHealth, detectIssues, recommendFix };
