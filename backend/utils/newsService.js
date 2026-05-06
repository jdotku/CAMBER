// ============================================================
// newsService.js — Real News Integration (Phase 5)
//
// This module replaces mock-risks.json with live headlines
// from NewsAPI. It adds two important production patterns:
//
//   1. CACHING: We store results in memory for 1 hour.
//      NewsAPI free tier = 100 requests/day. Without caching,
//      a team uploading BOMs all day would exhaust that quickly.
//      With caching, we fetch once per country per hour maximum.
//
//   2. GRACEFUL FALLBACK: If the API is down, the key is missing,
//      or we hit the rate limit, we silently use mock data.
//      The app still works — users just don't get live headlines.
//      This is called "degraded mode" and is essential for
//      production systems that can't afford to crash.
//
// Data flow:
//   Request → check cache (hit? return it) → call NewsAPI
//   → keyword-score headlines → cache result → return
//   If any step fails → return mock data for that country
// ============================================================

const fs   = require('fs');
const path = require('path');

// ============================================================
// CACHE SETUP
//
// An in-memory cache is the simplest option: it's just a
// JavaScript object that lives as long as the server process.
//
// Tradeoffs:
//   Pro: Zero extra dependencies, instant reads
//   Con: Cleared when the server restarts
//
// In production you'd use Redis for a persistent, shared cache
// (multiple server instances can share it). For our MVP this is fine.
// ============================================================

// Map of country → { data: {...}, fetchedAt: timestamp }
const newsCache = {};

// How long before we fetch fresh news. 1 hour = 3,600,000 ms.
// A country with 100 req/day budget can be refreshed at most ~4x/hour.
// 1-hour TTL keeps us well within limits even with many users.
const CACHE_TTL_MS = 60 * 60 * 1000;

// ============================================================
// LOAD MOCK DATA (fallback)
//
// We load mock-risks.json once at module load time.
// If NewsAPI fails for any reason, we return from this object
// so risk scoring still works — just with simulated data.
// ============================================================
let mockRisksDB = {};
try {
  const mockPath = path.join(__dirname, '../data/mock-risks.json');
  mockRisksDB = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
} catch {
  // If mock data is also missing, we'll return a safe default
}

const DEFAULT_RISK_ENTRY = {
  risk_score:    5,
  recent_events: ['No data available — manual review recommended'],
  source:        'default',
};

// ============================================================
// HELPER: scoreArticles(articles, riskRulesDB)
//
// NewsAPI gives us article headlines and descriptions.
// We scan each one for keywords from risk-rules.json
// (things like "typhoon", "strike", "sanction") and take
// the HIGHEST keyword weight found.
//
// Why take the max, not the average?
//   One "embargo" headline is more important than ten
//   neutral ones. We want the worst signal, not the average.
// ============================================================
function scoreArticles(articles, riskRulesDB) {
  const keywords = riskRulesDB.news_keywords || {};
  let maxScore = 1; // floor — even peaceful regions get 1

  articles.forEach(article => {
    // Combine title + description into one searchable string
    const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();

    Object.entries(keywords).forEach(([keyword, weight]) => {
      if (text.includes(keyword)) {
        maxScore = Math.max(maxScore, weight);
      }
    });
  });

  // Cap at 10 — our risk scale maximum
  return Math.min(maxScore, 10);
}

// ============================================================
// HELPER: extractRecentEvents(articles)
//
// Turns NewsAPI articles into the "recent_events" string array
// that riskCalculator.js expects. We take the top 3 titles
// and clean them up for display.
// ============================================================
function extractRecentEvents(articles) {
  return articles
    .slice(0, 3)
    .map(a => a.title)
    .filter(Boolean)
    .map(title => {
      // Trim "[source name]" suffixes that NewsAPI appends: "... - Reuters"
      return title.replace(/\s*-\s*[^-]+$/, '').trim();
    });
}

// ============================================================
// MAIN FUNCTION: getCountryRiskData(country, riskRulesDB)
//
// Returns a risk entry for the given country, shaped exactly
// like mock-risks.json entries so riskCalculator.js works
// identically whether data comes from the API or mock file.
//
// This is the "Adapter Pattern" — we translate different data
// sources into one consistent interface. The rest of the app
// doesn't know (or care) which source was used.
// ============================================================
async function getCountryRiskData(country, riskRulesDB) {
  // ---- Step 1: Check cache ----
  const cached = newsCache[country];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    const ageMinutes = Math.round((Date.now() - cached.fetchedAt) / 60000);
    console.log(`  [cache] ${country} (${ageMinutes}m old)`);
    return cached.data;
  }

  // ---- Step 2: Check for API key ----
  const apiKey = process.env.NEWS_API_KEY;
  const hasKey = apiKey && apiKey !== 'your_newsapi_key_here';

  if (!hasKey) {
    console.log(`  [mock]  ${country} — no NEWS_API_KEY set`);
    return mockRisksDB[country] || DEFAULT_RISK_ENTRY;
  }

  // ---- Step 3: Call NewsAPI ----
  try {
    // We search for supply-chain relevant news about the country.
    // Narrowing to "supply chain" + "semiconductor" reduces noise.
    const query = encodeURIComponent(
      `"${country}" supply chain semiconductor chip`
    );
    const url = [
      'https://newsapi.org/v2/everything',
      `?q=${query}`,
      '&language=en',
      '&sortBy=publishedAt',
      '&pageSize=10',         // fetch 10 articles, score them all, show top 3
      `&apiKey=${apiKey}`,
    ].join('');

    console.log(`  [fetch] NewsAPI → ${country}`);

    // fetch() is built into Node.js 18+. No import needed.
    const response = await fetch(url);

    // Handle rate limiting (429 Too Many Requests)
    if (response.status === 429) {
      console.warn(`  [limit] NewsAPI rate limit hit — falling back to mock for ${country}`);
      return mockRisksDB[country] || DEFAULT_RISK_ENTRY;
    }

    if (!response.ok) {
      throw new Error(`NewsAPI HTTP ${response.status}`);
    }

    const json = await response.json();

    // NewsAPI returns status: "error" for invalid keys, etc.
    if (json.status !== 'ok') {
      throw new Error(json.message || `NewsAPI returned status: ${json.status}`);
    }

    const articles = json.articles || [];

    // If no articles, don't cache — we might get results later.
    // Fall back to mock so we have SOME data to work with.
    if (articles.length === 0) {
      console.log(`  [empty] No articles for ${country} — using mock`);
      return mockRisksDB[country] || DEFAULT_RISK_ENTRY;
    }

    // ---- Step 4: Score and format ----
    const data = {
      risk_score:    scoreArticles(articles, riskRulesDB),
      recent_events: extractRecentEvents(articles),
      source:        'newsapi',                       // so we can show "LIVE" badge in UI
      article_count: articles.length,
      fetched_at:    new Date().toISOString(),
    };

    // ---- Step 5: Store in cache ----
    newsCache[country] = { data, fetchedAt: Date.now() };

    console.log(`  [ok]    ${country}: score=${data.risk_score}, ${articles.length} articles`);
    return data;

  } catch (err) {
    // Any error (network, auth, unexpected JSON) → fall back silently.
    // We log it so developers can debug, but users see no difference.
    console.warn(`  [fallback] NewsAPI error for ${country}: ${err.message}`);
    return mockRisksDB[country] || DEFAULT_RISK_ENTRY;
  }
}

// ============================================================
// HELPER: getCacheStatus()
//
// Returns metadata about what's currently cached.
// Used by the GET /api/cache-status endpoint so developers
// can inspect cache state without looking at server logs.
// ============================================================
function getCacheStatus() {
  return Object.entries(newsCache).map(([country, entry]) => ({
    country,
    source:       entry.data.source || 'unknown',
    risk_score:   entry.data.risk_score,
    age_minutes:  Math.round((Date.now() - entry.fetchedAt) / 60000),
    expires_in:   Math.round((CACHE_TTL_MS - (Date.now() - entry.fetchedAt)) / 60000),
  }));
}

// ============================================================
// HELPER: clearCache(country?)
//
// Clears one country (or all if no argument). Useful for
// forcing a fresh fetch during testing.
// ============================================================
function clearCache(country = null) {
  if (country) {
    delete newsCache[country];
  } else {
    Object.keys(newsCache).forEach(k => delete newsCache[k]);
  }
}

module.exports = { getCountryRiskData, getCacheStatus, clearCache };
