// ============================================================
// DetailedPartView.js — Deep-dive for a single part (Phase 7)
//
// WHY a separate view?
//   The overview gives you the ranking. This view gives you the
//   full context a PM needs before picking up the phone:
//   "Why is this score 8.5? What news drove it? Who can I switch to?
//   What does it cost if this supplier goes down?"
// ============================================================

import React, { useState } from 'react';
import './DetailedPartView.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Cost exposure if the supplier is disrupted:
// rough estimate = quantity × unit_cost × weeks of delay / 52
function estimateCostExposure(part, weeksAtRisk = 6) {
  const qty  = parseFloat(part.quantity)  || 0;
  const cost = parseFloat(part.unit_cost) || 0;
  return qty * cost * (weeksAtRisk / 52);
}

function riskColor(score) {
  if (score > 6) return '#FF0000';
  if (score > 3) return '#0000FF';
  return '#008000';
}

function DetailedPartView({ part, onBack }) {
  const [explanation, setExplanation] = useState(null);
  const [explaining,  setExplaining]  = useState(false);

  const color         = riskColor(part.risk_score);
  const costExposure  = estimateCostExposure(part);
  const lineCost      = (parseFloat(part.quantity) || 0) * (parseFloat(part.unit_cost) || 0);
  const isAIPowered   = part.recommendation_source === 'claude';
  const alternatives  = part.alternatives || [];

  const fmt = n => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(n);

  async function loadExplanation() {
    setExplaining(true);
    try {
      const res  = await fetch(`${API_BASE}/api/explain-risk`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ part }),
      });
      const data = await res.json();
      setExplanation(data.explanation || 'No explanation returned.');
    } catch {
      setExplanation('Could not load — check the backend is running.');
    } finally {
      setExplaining(false);
    }
  }

  return (
    <div className="detailed-part-view">

      {/* ---- BACK ---- */}
      <button className="back-button" onClick={onBack}>
        ← Back to overview
      </button>

      {/* ---- PART HEADER ---- */}
      <div className="part-header">
        <div className="part-header-left">
          <h1 className="part-name">{part.part_name}</h1>
          {part.part_number && (
            <div className="part-number">Part #: {part.part_number}</div>
          )}
          <div className="part-manufacturer">
            {part.manufacturer} · {part.country} · {part.risk_region}
          </div>
        </div>
        <div
          className="risk-badge-large"
          style={{ color, borderColor: color, background: `${color}18` }}
        >
          <div className="risk-badge-score">{part.risk_score}</div>
          <div className="risk-badge-label">{part.risk_level} Risk</div>
        </div>
      </div>

      {/* ---- RISK PROFILE ---- */}
      <div className="detail-section risk-profile">
        <h3>Risk Profile</h3>
        <div className="risk-score-large" style={{ color }}>
          {part.risk_score}<span className="risk-denom">/10</span>
        </div>

        {part.risk_factors && part.risk_factors.length > 0 && (
          <div className="factor-group">
            <div className="factor-label">Contributing Factors</div>
            <ul className="factor-list">
              {part.risk_factors.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}

        {part.news_keywords && part.news_keywords.length > 0 && (
          <div className="factor-group">
            <div className="factor-label">Live News Signals</div>
            <div className="keyword-tags">
              {part.news_keywords.map((kw, i) => (
                <span key={i} className={`keyword-tag cat-${kw.category}`}>
                  {kw.word}
                  <span className="kw-score">+{kw.score}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {part.recent_events && part.recent_events.length > 0 && (
          <div className="factor-group">
            <div className="factor-label">Recent Events</div>
            <ul className="events-list">
              {part.recent_events.map((ev, i) => <li key={i}>{ev}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* ---- COST IMPACT ---- */}
      <div className="detail-section cost-impact">
        <h3>Cost Impact</h3>
        <div className="cost-grid">
          <div className="cost-item">
            <div className="cost-label">Line Value</div>
            <div className="cost-value">{fmt(lineCost)}</div>
            <div className="cost-sub">{part.quantity} units × {fmt(parseFloat(part.unit_cost) || 0)}</div>
          </div>
          <div className="cost-item cost-item-exposure">
            <div className="cost-label">Disruption Exposure</div>
            <div className="cost-value exposure">{fmt(costExposure)}</div>
            <div className="cost-sub">est. 6-week supply gap cost</div>
          </div>
        </div>
      </div>

      {/* ---- RECOMMENDATION ---- */}
      <div className="detail-section recommendation-section">
        <h3>
          Recommendation
          {isAIPowered && <span className="ai-inline-badge">✦ AI</span>}
        </h3>
        <div className="recommendation-text">{part.recommendation}</div>
      </div>

      {/* ---- ALTERNATIVE SUPPLIERS ---- */}
      {alternatives.length > 0 && (
        <div className="detail-section alternatives-section">
          <h3>Alternative Suppliers</h3>
          <ul className="alternatives-list-detail">
            {alternatives.map((alt, i) => (
              <li key={i}>{alt}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- DEEP EXPLAIN (AI only) ---- */}
      {isAIPowered && (
        <div className="detail-section explain-section">
          <h3>Deep Risk Explanation</h3>
          <p className="explain-intro">
            Ask Claude to explain the compounding effect of these risk factors
            and what signals to watch.
          </p>
          {!explanation && (
            <button
              className="explain-btn-detail"
              onClick={loadExplanation}
              disabled={explaining}
            >
              {explaining ? '⟳ Loading…' : '⊕ Generate deep explanation'}
            </button>
          )}
          {explanation && (
            <div className="explain-text-detail">{explanation}</div>
          )}
        </div>
      )}

    </div>
  );
}

export default DetailedPartView;
