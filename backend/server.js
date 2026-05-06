// ============================================================
// server.js — CAMBER Backend API (Phase 6)
// ============================================================
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const { calculatePartRisk } = require('./utils/riskCalculator');

// Phase 6: Claude-powered recommendations with rule-based fallback
const {
  generateAIRecommendation,
  generateDeepExplanation,
  getRecommenderStatus,
  clearRecommendationCache,
} = require('./utils/claudeRecommender');

const {
  getCountryRiskData,
  getCacheStatus,
  clearCache,
} = require('./utils/newsapi');

// Phase 8: Vulnerability scanner + scenario simulation
const { scanForVulnerabilities, generateVulnerabilityReport } = require('./utils/vulnerabilityCheck');
const scenarioRouter = require('./routes/scenarios');
const { findAlternatives } = require('./utils/specMatchEngine');
const { calculateBOMHealth, detectIssues, recommendFix } = require('./utils/scoreCalculator');
const { analyzeAndExplain, analyzePartContext, analyzeNetworkContext } = require('./utils/claudeAnalyzer');

const app  = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phase 8: Scenario simulation routes (/api/scenarios/templates, /api/scenarios/simulate)
app.use('/api/scenarios', scenarioRouter);

// ============================================================
// LOAD STATIC DATABASES
// ============================================================
function loadDatabase(filename, label) {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8')
    );
    console.log(`✓ ${label} loaded`);
    return data;
  } catch (err) {
    console.error(`✗ Failed to load ${filename}:`, err.message);
    return {};
  }
}

const manufacturersDB = loadDatabase('manufacturers.json', 'Manufacturers DB');
const riskRulesDB     = loadDatabase('risk-rules.json',    'Risk Rules DB');

// ============================================================
// STARTUP: Show API key status.
//
// We NEVER log the full key — that would expose it in log files,
// terminal history, and CI output. We show only the first 10
// characters so you can confirm which key is active without
// revealing it.
// ============================================================
const apiKey    = process.env.NEWS_API_KEY;
const hasApiKey = apiKey && apiKey !== 'your_newsapi_key_here';

console.log('');
if (hasApiKey) {
  const maskedKey = apiKey.slice(0, 10) + '...';
  console.log(`✓ News API ready (update limit: 60 seconds)`);
  console.log(`  Using API key: ${maskedKey}`);
} else {
  console.log('ℹ NEWS_API_KEY not set — using mock news data only');
  console.log('  Add your key to backend/.env to enable live news');
}
console.log('');

// ============================================================
// HELPERS
// ============================================================
function getManufacturerData(manufacturerName) {
  const nameLower = (manufacturerName || '').toLowerCase().trim();
  const match = Object.keys(manufacturersDB).find(
    key => key.toLowerCase() === nameLower
  );
  return match ? manufacturersDB[match] : {
    country: 'Unknown', primary_port: 'Unknown',
    risk_region: 'Unknown', geopolitical_risk: 5,
  };
}

function parseCSVString(csvString) {
  const lines = csvString.replace(/\r\n/g, '\n').trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header and at least one data row.');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(',').map(v => v.trim());
    return headers.reduce((obj, h, i) => { obj[h] = values[i] ?? ''; return obj; }, {});
  });
}

// ============================================================
// ROUTE: GET /api/health
// ============================================================
app.get('/api/health', (req, res) => {
  const claude = getRecommenderStatus();
  res.json({
    status:               'OK',
    message:              'CAMBER backend is running',
    news_mode:            hasApiKey ? 'live' : 'mock',
    ai_recommendations:   claude.enabled,
    recommendation_cache: claude.cache_size,
    timestamp:            new Date().toISOString(),
  });
});

// ============================================================
// ROUTE: GET /api/cache-status
// ============================================================
app.get('/api/cache-status', (req, res) => {
  res.json({ cache: getCacheStatus(), ttl_seconds: 60 });
});

// ============================================================
// ROUTE: DELETE /api/cache
// Clears news cache (and optionally the AI recommendation cache)
// ============================================================
app.delete('/api/cache', (req, res) => {
  const { country, recommendations } = req.query;
  clearCache(country || null);
  if (recommendations === 'true') {
    clearRecommendationCache();
  }
  res.json({
    success: true,
    message: [
      country ? `News cache cleared for ${country}` : 'Full news cache cleared',
      recommendations === 'true' ? 'Recommendation cache cleared' : null,
    ].filter(Boolean).join('; '),
  });
});

// ============================================================
// ROUTE: GET /api/news/:country
//
// Lets the frontend (or a developer) ask "What's happening in
// Taiwan right now?" without uploading a whole BOM.
//
// Example: GET /api/news/Taiwan
//          GET /api/news/South%20Korea
//
// This is also useful for debugging — you can hit this endpoint
// directly to see what NewsAPI returns for any country.
// ============================================================
app.get('/api/news/:country', async (req, res) => {
  try {
    const country = req.params.country;

    if (!country) {
      return res.status(400).json({ success: false, error: 'Country name is required.' });
    }

    const data = await getCountryRiskData(country);

    res.json({
      success:        true,
      country,
      risk_score:     data.risk_score,
      keywords:       data.keywords,
      recent_news:    data.recent_news,
      articles_count: data.articles_count,
      source:         data.source,
      last_updated:   data.last_updated,
    });

  } catch (err) {
    console.error('✗ /api/news error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/parse-bom
//
// Full pipeline: CSV → geo-enrich → fetch live news per country
// → score with keyword boost → generate recommendation → respond.
//
// Phase 5 change in the scoring step:
//   Before: calculatePartRisk(part, manufacturersDB, riskRulesDB, liveRisksDB)
//           where liveRisksDB was a dictionary { Taiwan: {...}, ... }
//
//   After:  calculatePartRisk(part, manufacturersDB, riskRulesDB, countryRiskData)
//           where countryRiskData is the pre-fetched data for THIS part's country
//
// Why the change? Cleaner separation — the function receives exactly
// what it needs, not a bag of all countries.
// ============================================================
app.post('/api/parse-bom', async (req, res) => {
  try {
    const { csvData } = req.body;

    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Request body must include a "csvData" string field.',
      });
    }

    // STEP 1: Parse CSV
    const parts = parseCSVString(csvData);

    // STEP 2: Geo-enrich
    const geoEnrichedParts = parts.map(part => {
      const geo = getManufacturerData(part.manufacturer);
      return {
        ...part,
        country:           geo.country,
        primary_port:      geo.primary_port,
        risk_region:       geo.risk_region,
        geopolitical_risk: geo.geopolitical_risk,
      };
    });

    // STEP 3: Fetch live news for each UNIQUE country in the BOM.
    //
    // Promise.all() runs all fetches concurrently — they happen at the
    // same time instead of waiting for one to finish before starting the next.
    // For a 10-part BOM with 5 unique countries: ~200ms total vs ~1000ms sequential.
    const uniqueCountries = [
      ...new Set(geoEnrichedParts.map(p => p.country).filter(c => c && c !== 'Unknown'))
    ];

    console.log(`  Fetching news for: ${uniqueCountries.join(', ')}`);

    // Build a lookup: { "Taiwan": { recent_news, keywords, risk_score, ... }, ... }
    const countryRiskMap = {};
    await Promise.all(
      uniqueCountries.map(async country => {
        countryRiskMap[country] = await getCountryRiskData(country);
      })
    );

    // STEP 4: Score + AI recommendation for each part — in parallel.
    //
    // We switched from .map() to Promise.all(async map) because
    // generateAIRecommendation() is async (it calls Claude API).
    //
    // Promise.all starts ALL Claude calls simultaneously instead of
    // waiting for each one to finish before starting the next.
    // For a 10-part BOM: ~600ms total vs ~6000ms sequential.
    const enrichedParts = await Promise.all(
      geoEnrichedParts.map(async part => {
        const countryRiskData = countryRiskMap[part.country] || null;

        // Pure math — still synchronous and instant
        const riskResult = calculatePartRisk(part, manufacturersDB, riskRulesDB, countryRiskData);

        // AI call — async, ~300–800ms, falls back to rules if Claude is unavailable
        const {
          text:                recommendation,
          source:              rec_source,
          recommendation_type: rec_type,
          alternatives:        rec_alternatives,
        } = await generateAIRecommendation(part, riskResult, countryRiskData);

        return {
          ...part,
          risk_score:             riskResult.raw_score,
          risk_level:             riskResult.risk_level,
          risk_factors:           riskResult.contributing_factors,
          recent_events:          riskResult.recent_events,
          news_keywords:          riskResult.news_keywords,
          recommendation,
          recommendation_source:  rec_source,       // 'claude' | 'rule-based'
          recommendation_type:    rec_type,          // 'claude' | 'rule-based'
          alternatives:           rec_alternatives,  // string[]
          data_source:            countryRiskData?.source || 'unknown',
        };
      })
    );

    const liveCount = enrichedParts.filter(p => p.data_source === 'newsapi').length;
    const aiCount   = enrichedParts.filter(p => p.recommendation_source === 'claude').length;

    // Now every BOM upload includes vulnerability assessment.
    const vulnResult = scanForVulnerabilities(enrichedParts);

    console.log(
      `✓ /api/parse-bom: ${enrichedParts.length} parts — ` +
      `${liveCount} live news, ${aiCount} AI recommendations, ` +
      `${vulnResult.total_vulnerabilities} vulnerabilities`
    );

    res.status(200).json({
      success:              true,
      count:                enrichedParts.length,
      news_mode:            hasApiKey ? 'live' : 'mock',
      data:                 enrichedParts,
      vulnerabilities:      vulnResult.vulnerabilities,
      severity_breakdown:   vulnResult.severity_breakdown,
      vulnerability_score:  vulnResult.vulnerability_score,
    });

  } catch (err) {
    console.error('✗ /api/parse-bom error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/vulnerabilities/scan
//
// Standalone vulnerability scan — accepts a BOM array directly.
// Also triggered after parse-bom for the full report + Claude insights.
// ============================================================
app.post('/api/vulnerabilities/scan', async (req, res) => {
  try {
    const { bomData } = req.body;

    if (!bomData || !Array.isArray(bomData) || bomData.length === 0) {
      return res.status(400).json({ success: false, error: 'bomData must be a non-empty array.' });
    }

    const scanResult    = scanForVulnerabilities(bomData);
    const mitigation    = await generateVulnerabilityReport(scanResult);

    console.log(
      `✓ /api/vulnerabilities/scan: ${scanResult.total_vulnerabilities} issues — ` +
      `${scanResult.severity_breakdown.critical} critical, ` +
      `${scanResult.severity_breakdown.high} high, ` +
      `${scanResult.severity_breakdown.medium} medium`
    );

    res.json({
      success:         true,
      vulnerabilities: scanResult.vulnerabilities,
      severity_breakdown:    scanResult.severity_breakdown,
      total_vulnerabilities: scanResult.total_vulnerabilities,
      vulnerability_score:   scanResult.vulnerability_score,
      mitigation_strategy:   mitigation,
    });

  } catch (err) {
    console.error('✗ /api/vulnerabilities/scan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/risk-analysis (single-part deep dive)
// ============================================================
app.post('/api/risk-analysis', async (req, res) => {
  try {
    const { part } = req.body;
    if (!part || typeof part !== 'object') {
      return res.status(400).json({ success: false, error: 'Request body must include a "part" object.' });
    }

    const geo = getManufacturerData(part.manufacturer);
    const enriched = {
      ...part,
      country:     part.country     || geo.country,
      risk_region: part.risk_region || geo.risk_region,
    };

    const countryRiskData = await getCountryRiskData(enriched.country);
    const riskResult      = calculatePartRisk(enriched, manufacturersDB, riskRulesDB, countryRiskData);
    const { text: recommendation, source: rec_source } =
      await generateAIRecommendation(enriched, riskResult, countryRiskData);

    res.status(200).json({
      success:                true,
      risk_score:             riskResult.raw_score,
      risk_level:             riskResult.risk_level,
      risk_factors:           riskResult.contributing_factors,
      recent_events:          riskResult.recent_events,
      news_keywords:          riskResult.news_keywords,
      recommendation,
      recommendation_source:  rec_source,
      data_source:            countryRiskData.source,
    });

  } catch (err) {
    console.error('✗ /api/risk-analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/explain-risk
//
// Deep-dive explanation for a single part. Accepts the same
// enriched part object the frontend already has, so the client
// doesn't need to re-upload the BOM.
//
// Body: { part: <enriched part object> }
// ============================================================
app.post('/api/explain-risk', async (req, res) => {
  try {
    const { part } = req.body;
    if (!part || typeof part !== 'object') {
      return res.status(400).json({ success: false, error: 'Request body must include a "part" object.' });
    }

    const geo = getManufacturerData(part.manufacturer);
    const enriched = {
      ...part,
      country:     part.country     || geo.country,
      risk_region: part.risk_region || geo.risk_region,
    };

    const countryRiskData = await getCountryRiskData(enriched.country);

    // Reconstruct a minimal riskScore shape from the already-scored part
    const riskScore = {
      raw_score:            part.risk_score,
      risk_level:           part.risk_level,
      contributing_factors: part.risk_factors   || [],
      recent_events:        part.recent_events   || [],
      news_keywords:        part.news_keywords   || [],
    };

    const explanation = await generateDeepExplanation(enriched, riskScore, countryRiskData);

    console.log(`✓ /api/explain-risk: deep dive for ${part.part_name}`);

    res.status(200).json({
      success:     true,
      part_name:   part.part_name,
      explanation,
    });

  } catch (err) {
    console.error('✗ /api/explain-risk error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/bom-health
// ============================================================
app.post('/api/bom-health', (req, res) => {
  try {
    const { bomData } = req.body;
    if (!bomData || !Array.isArray(bomData) || bomData.length === 0) {
      return res.status(400).json({ success: false, error: 'bomData must be a non-empty array.' });
    }
    const health         = calculateBOMHealth(bomData);
    const issues         = detectIssues(bomData);
    const recommendation = recommendFix(bomData, issues[0] || null);
    console.log(`✓ /api/bom-health: ${health.healthScore} — ${issues.length} issues`);
    res.json({ success: true, health, issues, recommendation });
  } catch (err) {
    console.error('✗ /api/bom-health error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/bom-analyze
// ============================================================
app.post('/api/bom-analyze', async (req, res) => {
  try {
    const { bomData, baseHealthScore } = req.body;
    if (!bomData || !Array.isArray(bomData) || bomData.length === 0) {
      return res.status(400).json({ success: false, error: 'bomData must be a non-empty array.' });
    }
    if (!baseHealthScore) {
      return res.status(400).json({ success: false, error: 'baseHealthScore is required.' });
    }
    const analysis = await analyzeAndExplain(bomData, baseHealthScore);
    console.log(`✓ /api/bom-analyze: ${baseHealthScore} — confidence: ${analysis.confidence}`);
    res.json({ success: true, analysis });
  } catch (err) {
    console.error('✗ /api/bom-analyze error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/claude-part-analysis
// ============================================================
app.post('/api/claude-part-analysis', async (req, res) => {
  try {
    const { part, allParts } = req.body;
    if (!part || !allParts) {
      return res.status(400).json({ success: false, error: 'part and allParts are required.' });
    }
    const analysis = await analyzePartContext(part, allParts);
    console.log(`✓ /api/claude-part-analysis: ${part.part_name}`);
    res.json({ success: true, analysis });
  } catch (err) {
    console.error('✗ /api/claude-part-analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/claude-network-analysis
// ============================================================
app.post('/api/claude-network-analysis', async (req, res) => {
  try {
    const { bomData } = req.body;
    if (!bomData || !Array.isArray(bomData) || bomData.length === 0) {
      return res.status(400).json({ success: false, error: 'bomData must be a non-empty array.' });
    }
    const analysis = await analyzeNetworkContext(bomData);
    console.log(`✓ /api/claude-network-analysis: ${bomData.length} parts`);
    res.json({ success: true, analysis });
  } catch (err) {
    console.error('✗ /api/claude-network-analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/claude-bom-context
// ============================================================
app.post('/api/claude-bom-context', async (req, res) => {
  try {
    const { bomData } = req.body;
    if (!bomData || !Array.isArray(bomData) || bomData.length === 0) {
      return res.status(400).json({ success: false, error: 'bomData must be a non-empty array.' });
    }
    const analysis = {
      context:        'Analyzing BOM-wide risks across all parts and manufacturers.',
      recommendation: 'Review the Risk & Alternatives tab for part-specific mitigation options.',
    };
    console.log(`✓ /api/claude-bom-context: ${bomData.length} parts`);
    res.json({ success: true, analysis });
  } catch (err) {
    console.error('✗ /api/claude-bom-context error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /api/spec-match/alternatives
// ============================================================
app.post('/api/spec-match/alternatives', (req, res) => {
  try {
    const { part, maxAlternatives } = req.body;
    if (!part || typeof part !== 'object') {
      return res.status(400).json({ success: false, error: 'Request body must include a "part" object.' });
    }
    const alternatives = findAlternatives(part, maxAlternatives || 5);
    console.log(`✓ /api/spec-match/alternatives: ${alternatives.length} alternatives for ${part.part_name}`);
    res.json({ success: true, original_part: part.part_name, alternatives });
  } catch (err) {
    console.error('✗ /api/spec-match/alternatives error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`✓ CAMBER backend running at http://localhost:${PORT}`);
  console.log(`  Health:             GET    /api/health`);
  console.log(`  Parse BOM:          POST   /api/parse-bom`);
  console.log(`  Explain risk:       POST   /api/explain-risk`);
  console.log(`  News by country:    GET    /api/news/:country`);
  console.log(`  Cache status:       GET    /api/cache-status`);
  console.log(`  Clear cache:        DELETE /api/cache`);
  console.log(`  Vulnerability scan: POST   /api/vulnerabilities/scan`);
  console.log(`  Scenario templates: GET    /api/scenarios/templates`);
  console.log(`  Simulate scenario:  POST   /api/scenarios/simulate`);
  console.log('');
});
