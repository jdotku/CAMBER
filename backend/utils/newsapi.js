// ============================================================
// newsapi.js — NewsAPI Integration (Phase 5)
//
// This module handles everything related to fetching real news:
//   1. fetchNewsForCountry — raw API call, returns articles
//   2. extractRiskKeywords  — scans headlines for risk signals
//   3. getCountryRiskData   — orchestrates both + caching + fallback
//
// WHY fetch real news instead of using mock data?
//   Because a "typhoon" headline in Taiwan this week is more
//   accurate than our static mock file written months ago.
//   Real data → better risk scores → better decisions.
//
// WHY do we need caching?
//   NewsAPI free tier = 100 requests/day. If we fetch on every
//   BOM upload with no caching, 20 uploads × 5 countries = 100
//   requests — daily limit gone by lunchtime. With 60-second
//   caching, repeated queries for the same country within a
//   minute hit the in-memory store, not the API.
// ============================================================

// dotenv reads the .env file and loads values into process.env.
// It's safe to call .config() here even though server.js also calls it —
// dotenv won't overwrite vars that are already set.
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

// ============================================================
// LOAD REFERENCE DATA
// ============================================================

// keyword-rules.json defines which words are dangerous and how much
// each one increases the risk score.
let keywordRules = {};
try {
  keywordRules = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/keyword-rules.json'), 'utf8')
  );
} catch {
  console.warn('  ⚠ keyword-rules.json not found — keyword scoring disabled');
}

// mock-risks.json is our FALLBACK. If NewsAPI is down, key is missing,
// or returns no results, we serve this data instead.
// The app still works — users just get baseline estimates instead of live data.
let mockRisksDB = {};
try {
  mockRisksDB = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/mock-risks.json'), 'utf8')
  );
} catch {
  console.warn('  ⚠ mock-risks.json not found — no fallback data available');
}

// ============================================================
// CACHE SETUP
//
// A plain JS object is our "in-memory cache."
// It lives as long as the server process runs (cleared on restart).
//
// Structure:
//   newsCache["Taiwan"] = {
//     data:      { recent_news, keywords, risk_score, ... },
//     fetchedAt: 1714300800000  // milliseconds since epoch
//   }
// ============================================================
const newsCache   = {};
const CACHE_TTL   = 60 * 1000; // 60 seconds — balances freshness vs rate limit

// ============================================================
// FUNCTION: fetchNewsForCountry(country)
//
// Makes a single request to NewsAPI for supply-chain relevant
// news about the given country. Returns raw article objects.
//
// Returns: array of articles (may be empty if none found or API fails)
//
// NEVER throws — any failure returns [] so callers don't crash.
// ============================================================
async function fetchNewsForCountry(country) {
  const apiKey = process.env.NEWS_API_KEY;

  // Validate the key exists and isn't the placeholder
  if (!apiKey || apiKey === 'your_newsapi_key_here') {
    return []; // Caller will detect empty array and use mock data
  }

  try {
    // We narrow the query to supply-chain context so we don't get
    // general politics news — we want OPERATIONAL risk signals.
    const query = encodeURIComponent(`"${country}" supply chain semiconductor chip`);
    const url   = [
      'https://newsapi.org/v2/everything',
      `?q=${query}`,
      '&language=en',
      '&sortBy=publishedAt',
      '&pageSize=5',
      `&apiKey=${apiKey}`,
    ].join('');

    const response = await fetch(url);

    // 429 = rate limit hit. Don't retry — return empty and use fallback.
    if (response.status === 429) {
      console.warn(`  ⚠ NewsAPI rate limit hit for "${country}" — using fallback`);
      return [];
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();

    // NewsAPI returns status: "error" for bad keys, exceeded limits, etc.
    if (json.status !== 'ok') {
      throw new Error(json.message || `API returned status: ${json.status}`);
    }

    return json.articles || [];

  } catch (err) {
    // Network errors, JSON parse errors, unexpected responses
    console.warn(`  ⚠ fetchNewsForCountry("${country}") failed: ${err.message}`);
    return [];
  }
}

// ============================================================
// FUNCTION: extractRiskKeywords(newsArticles)
//
// Scans article headlines + descriptions for keywords defined
// in keyword-rules.json. Returns what we found and how risky
// those findings are.
//
// We're not using AI here — just simple string matching.
// Phase 8 will use Claude to understand context and nuance.
// For example, "no fire at TSMC plant" mentions "fire" but
// is actually reassuring — keyword matching can't catch that.
// Claude can.
//
// Returns:
//   {
//     keywords:    [{ word, category, score }],  — each unique keyword found
//     keywordCount: { "strike": 2, "typhoon": 1 }, — how often each appeared
//     risk_score:   7                              — highest keyword weight found
//   }
// ============================================================
function extractRiskKeywords(newsArticles) {
  const keywordCount = {};
  const foundKeywords = {};

  newsArticles.forEach(article => {
    // Search both title and description for maximum coverage
    const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();

    // Walk through every severity category and every keyword in it
    Object.entries(keywordRules).forEach(([category, words]) => {
      Object.entries(words).forEach(([word, score]) => {
        if (text.includes(word)) {
          // Count occurrences across all articles for this keyword
          keywordCount[word] = (keywordCount[word] || 0) + 1;

          // Keep the highest score if the same word appears in multiple categories
          if (!foundKeywords[word] || foundKeywords[word].score < score) {
            foundKeywords[word] = { word, category, score };
          }
        }
      });
    });
  });

  const keywords = Object.values(foundKeywords);

  // risk_score = the single highest-weight keyword found.
  // One "embargo" (10) is more significant than ten "forecast" (1).
  const maxScore = keywords.reduce((max, kw) => Math.max(max, kw.score), 1);

  return {
    keywords,
    keywordCount,
    risk_score: Math.min(maxScore, 10),
  };
}

// ============================================================
// FUNCTION: getCountryRiskData(country)
//
// The public interface — this is what server.js calls.
// It orchestrates caching, API fetching, keyword extraction,
// and fallback in the right order.
//
// Returns an object that riskCalculator.js understands:
//   {
//     recent_news:    string[],   — headline strings for display
//     keywords:       object[],   — [{ word, category, score }]
//     risk_score:     number,     — 1-10
//     articles_count: number,
//     last_updated:   string,     — ISO timestamp
//     source:         string      — "newsapi" | "mock" | "default"
//   }
// ============================================================
async function getCountryRiskData(country) {
  // ---- Step 1: Return from cache if fresh ----
  const cached = newsCache[country];
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
    const ageSeconds = Math.round((Date.now() - cached.fetchedAt) / 1000);
    console.log(`  [cache] ${country} (${ageSeconds}s old)`);
    return cached.data;
  }

  // ---- Step 2: Fetch from NewsAPI ----
  console.log(`  [fetch] NewsAPI → ${country}`);
  const articles = await fetchNewsForCountry(country);

  // ---- Step 3a: We got articles — extract signals ----
  if (articles.length > 0) {
    const { keywords, keywordCount, risk_score } = extractRiskKeywords(articles);

    // Format article titles for display (strip "[Source Name]" suffixes)
    const recent_news = articles
      .slice(0, 3)
      .map(a => (a.title || '').replace(/\s*-\s*[^-]+$/, '').trim())
      .filter(Boolean);

    const data = {
      recent_news,
      keywords,
      keywordCount,
      risk_score,
      articles_count: articles.length,
      last_updated:   new Date().toISOString(),
      source:         'newsapi',
    };

    // Store in cache for the next 60 seconds
    newsCache[country] = { data, fetchedAt: Date.now() };

    console.log(
      `  [ok]    ${country}: score=${risk_score}, ` +
      `keywords=[${keywords.map(k => k.word).join(', ') || 'none'}]`
    );
    return data;
  }

  // ---- Step 3b: No articles (API failed, empty results, rate limit) ----
  // Fall back to mock data for this country.
  const mock = mockRisksDB[country];
  if (mock) {
    console.log(`  [mock]  ${country} — no live articles, using baseline`);
    return {
      recent_news:    mock.recent_events || [],
      keywords:       [],
      keywordCount:   {},
      risk_score:     mock.risk_score || 5,
      articles_count: 0,
      last_updated:   new Date().toISOString(),
      source:         'mock',
    };
  }

  // ---- Step 3c: Not even in mock data ----
  console.log(`  [default] ${country} — unknown country, using default risk`);
  return {
    recent_news:    ['No data available — manual review recommended'],
    keywords:       [],
    keywordCount:   {},
    risk_score:     5,
    articles_count: 0,
    last_updated:   new Date().toISOString(),
    source:         'default',
  };
}

// Expose the cache for the /api/cache-status endpoint
function getCacheStatus() {
  return Object.entries(newsCache).map(([country, entry]) => ({
    country,
    source:      entry.data.source,
    risk_score:  entry.data.risk_score,
    age_seconds: Math.round((Date.now() - entry.fetchedAt) / 1000),
    expires_in:  Math.round((CACHE_TTL - (Date.now() - entry.fetchedAt)) / 1000),
  }));
}

function clearCache(country = null) {
  if (country) {
    delete newsCache[country];
  } else {
    Object.keys(newsCache).forEach(k => delete newsCache[k]);
  }
}

module.exports = { fetchNewsForCountry, extractRiskKeywords, getCountryRiskData, getCacheStatus, clearCache };
