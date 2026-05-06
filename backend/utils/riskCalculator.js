// ============================================================
// riskCalculator.js — Risk Scoring Engine (Phase 5 Update)
//
// Phase 5 change: the fourth parameter is now 'countryRiskData'
// (data for ONE specific country) instead of 'mockRisksDB'
// (a dictionary of all countries). This makes the function
// signature cleaner — callers fetch the right country's data
// before calling this function, rather than passing everything
// and letting this function dig through it.
//
// New feature: news keyword boost.
// If the newsapi module found keywords like "strike" or "typhoon"
// in live headlines, we add a score boost proportional to severity.
// This makes Taiwan's TSMC even riskier on days when there are
// actual supply chain warnings in the news.
// ============================================================

function suggestAlternativeRegion(currentRegion) {
  const alternatives = {
    'Taiwan Strait': 'EU or USA',
    'East Asia':     'USA or EU',
    'Pacific':       'EU',
    'Europe':        'USA',
    'Unknown':       'a known low-risk region',
  };
  return alternatives[currentRegion] || 'a geopolitically stable region';
}

// ============================================================
// HELPER: calculateNewsBoost(keywords)
//
// Translates a list of found keywords into an additive score
// boost. More severe keywords add more points.
//
// The boost is capped at +3 so even a flood of bad headlines
// can't push a normally-stable supplier to "High Risk" alone.
// Geopolitical fundamentals still anchor the base score.
//
// Boost scale:
//   critical: +1.5 per keyword (war, embargo, sanctions)
//   high:     +1.0 per keyword (typhoon, strike, fire)
//   medium:   +0.5 per keyword (tariff, delay, disruption)
//   low:      +0.25 per keyword (price, demand, warning)
// ============================================================
function calculateNewsBoost(keywords) {
  if (!keywords || keywords.length === 0) return 0;

  const boostMap = {
    critical: 1.5,
    high:     1.0,
    medium:   0.5,
    low:      0.25,
  };

  const total = keywords.reduce((sum, kw) => {
    return sum + (boostMap[kw.category] || 0.25);
  }, 0);

  // Cap at 3.0 so base geopolitical risk stays dominant
  return Math.min(3.0, total);
}

// ============================================================
// HELPER: buildContributingFactors
//
// Generates human-readable explanations of what drove the score.
// These are shown in the "Risk Factors" column and detail panel.
// ============================================================
function buildContributingFactors(riskRegion, geoZoneScore, countryRiskScore, newsKeywords, newsBoost) {
  const factors = [];

  if (geoZoneScore >= 7) {
    factors.push(`High geopolitical tension in ${riskRegion}`);
  } else if (geoZoneScore >= 4) {
    factors.push(`Moderate geopolitical exposure (${riskRegion})`);
  } else {
    factors.push(`Low geopolitical risk (${riskRegion})`);
  }

  if (countryRiskScore >= 6) {
    factors.push('Active regional risk events (see recent news)');
  } else if (countryRiskScore >= 3) {
    factors.push('Minor regional events detected');
  }

  // Add a factor for news-based keywords if any were found
  if (newsKeywords && newsKeywords.length > 0) {
    const kwWords = newsKeywords.map(k => k.word).join(', ');
    factors.push(`News signals detected: ${kwWords} (+${newsBoost.toFixed(1)} pts)`);
  }

  return factors;
}

// ============================================================
// FUNCTION: calculatePartRisk(part, manufacturersDB, riskRulesDB, countryRiskData)
//
// Parameters:
//   part            — geo-enriched BOM part (has country, risk_region, etc.)
//   manufacturersDB — manufacturer lookup (kept for future use / verification)
//   riskRulesDB     — geopolitical zone scores
//   countryRiskData — result from newsapi.getCountryRiskData() for this part's country
//                     Shape: { recent_news, keywords, risk_score, source, ... }
//                     OR null if the country is unknown / API failed entirely
// ============================================================
function calculatePartRisk(part, manufacturersDB, riskRulesDB, countryRiskData) {

  // ---- SIGNAL 1: Geopolitical zone ----
  const riskRegion    = part.risk_region || 'Unknown';
  const geoZoneScore  = riskRulesDB.geopolitical_zones[riskRegion] || 5;

  // ---- SIGNAL 2: Country news risk ----
  // countryRiskData is the pre-fetched data for this part's country.
  // If null (unknown country), we use safe defaults.
  let countryNewsScore;
  let recentNews;
  let newsKeywords = [];

  if (countryRiskData) {
    countryNewsScore = countryRiskData.risk_score || 5;
    // Normalize: newsapi.js returns 'recent_news', mock data may have 'recent_events'
    recentNews       = countryRiskData.recent_news || countryRiskData.recent_events || [];
    newsKeywords     = countryRiskData.keywords    || [];
  } else {
    // Unknown country — flag it with a medium default so it's reviewed
    console.log(`  No risk data for "${part.country}" — using default score`);
    countryNewsScore = 5;
    recentNews       = ['No data available — manual review recommended'];
    newsKeywords     = [];
  }

  // ---- COMBINE: Base score ----
  const baseScore = (geoZoneScore + countryNewsScore) / 2;

  // ---- SIGNAL 3: News keyword boost ----
  // Real headlines with dangerous keywords push the score up.
  // Example: "strike + typhoon" in Taiwan → +2.0 pts
  const newsBoost = calculateNewsBoost(newsKeywords);

  // ---- FINAL SCORE ----
  // Clamp to 1–10 so we stay on-scale
  const rawScore = Math.min(10, Math.max(1, baseScore + newsBoost));

  let riskLevel;
  if (rawScore <= 3) riskLevel = 'Low';
  else if (rawScore <= 6) riskLevel = 'Medium';
  else riskLevel = 'High';

  return {
    raw_score:            Math.round(rawScore * 10) / 10,
    risk_level:           riskLevel,
    contributing_factors: buildContributingFactors(
      riskRegion, geoZoneScore, countryNewsScore, newsKeywords, newsBoost
    ),
    recent_events: recentNews,
    news_keywords: newsKeywords,
  };
}

// ============================================================
// FUNCTION: generateRecommendation (unchanged from Phase 4)
// ============================================================
function generateRecommendation(part, riskScore) {
  const { risk_level, raw_score } = riskScore;
  const altRegion = suggestAlternativeRegion(part.risk_region);

  if (risk_level === 'High') {
    const estimatedLeadWeeks = Math.floor(raw_score * 1.5 + 4);
    return (
      `CRITICAL: Single-source dependency in high-risk region (${part.risk_region}). ` +
      `Immediately qualify an alternative supplier in ${altRegion}. ` +
      `Estimated qualification lead time: ${estimatedLeadWeeks}–${estimatedLeadWeeks + 4} weeks. ` +
      `Consider increasing safety stock while qualification is in progress.`
    );
  }

  if (risk_level === 'Medium') {
    return (
      `Consider diversifying supply for ${part.part_name}. ` +
      `Add a secondary vendor in ${altRegion} to reduce concentration risk. ` +
      `Review pricing contracts for volatility clauses. ` +
      `Re-evaluate quarterly or if regional news score rises above 6.`
    );
  }

  return (
    `No immediate action required. ${part.manufacturer} in ${part.country} ` +
    `shows stable supply conditions. ` +
    `Continue standard quarterly review. ` +
    `Monitor for news events that could change regional risk score.`
  );
}

module.exports = { calculatePartRisk, generateRecommendation };
