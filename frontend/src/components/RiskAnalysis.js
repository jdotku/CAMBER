// ============================================================
// RiskAnalysis.js — RISK ANALYSIS TAB (Phase 8: Terminal Theme)
//
// Three panels for a PM who needs to act:
//   1. Critical actions (High-risk parts needing immediate work)
//   2. Top risk drivers (ranked list, click-through to detail)
//   3. AI recommendations per high-risk part
// ============================================================

import React, { useState } from 'react';
import DetailedPartView    from './DetailedPartView';
import RecommendationCard  from './RecommendationCard';
import './RiskAnalysis.css';

function RiskAnalysis({ bomData, metrics }) {
  const [selectedPart, setSelectedPart] = useState(null);

  // Drill-in: show DetailedPartView for the chosen part
  if (selectedPart) {
    return (
      <DetailedPartView
        part={selectedPart}
        onBack={() => setSelectedPart(null)}
      />
    );
  }

  const criticalParts = bomData.filter(p => p.risk_level === 'High');
  const topRisks      = [...bomData]
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 8);

  return (
    <div className="risk-analysis">

      {/* ============================================================
          SECTION 1: CRITICAL ACTIONS
          High-risk parts that need immediate PM attention.
          ============================================================ */}
      {criticalParts.length > 0 && (
        <section className="ra-section critical-section">
          <h2>CRITICAL ACTIONS REQUIRED [{criticalParts.length}]</h2>
          <ul className="critical-list">
            {criticalParts.map((part, i) => (
              <li key={part.part_id || i} className="critical-item">
                <div className="critical-item-header">
                  <div className="critical-item-left">
                    <span className="risk-badge-inline high">HIGH</span>
                    <strong className="critical-part-name">{part.part_name}</strong>
                  </div>
                  <span className="critical-score">{part.risk_score}/10</span>
                </div>
                <div className="critical-meta">
                  {part.manufacturer} · {part.country} · {part.risk_region}
                </div>
                {part.risk_factors && part.risk_factors.length > 0 && (
                  <div className="critical-reason">
                    {part.risk_factors.slice(0, 2).join(' | ')}
                  </div>
                )}
                <button
                  className="detail-btn"
                  onClick={() => setSelectedPart(part)}
                >
                  VIEW FULL ANALYSIS →
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {criticalParts.length === 0 && (
        <section className="ra-section">
          <h2>CRITICAL ACTIONS</h2>
          <p className="ra-all-clear">[ NO HIGH-RISK PARTS DETECTED ]</p>
        </section>
      )}

      {/* ============================================================
          SECTION 2: TOP RISK DRIVERS (ranked table)
          ============================================================ */}
      <section className="ra-section">
        <h2>TOP RISK DRIVERS</h2>
        <table className="risk-drivers-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>PART NAME</th>
              <th>MANUFACTURER</th>
              <th>REGION</th>
              <th>SCORE</th>
              <th>LEVEL</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {topRisks.map((part, i) => {
              const level = part.risk_level?.toLowerCase() || 'low';
              return (
                <tr key={part.part_id || i} className={`driver-row driver-${level}`}>
                  <td className="driver-rank">#{i + 1}</td>
                  <td className="driver-name">{part.part_name}</td>
                  <td>{part.manufacturer}</td>
                  <td>{part.risk_region}</td>
                  <td className={`driver-score score-${level}`}>
                    {part.risk_score}/10
                  </td>
                  <td>
                    <span className={`risk-badge-inline ${level}`}>
                      {(part.risk_level || 'LOW').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <button
                      className="small-detail-btn"
                      onClick={() => setSelectedPart(part)}
                    >
                      DETAIL
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* ============================================================
          SECTION 3: AI RECOMMENDATIONS for high-risk parts
          ============================================================ */}
      {criticalParts.length > 0 && (
        <section className="ra-section">
          <h2>AI RECOMMENDATIONS — HIGH-RISK PARTS</h2>
          {criticalParts.map((part, i) => (
            <RecommendationCard
              key={part.part_id || i}
              part={part}
              riskLevel={part.risk_level || 'High'}
            />
          ))}
        </section>
      )}

    </div>
  );
}

export default RiskAnalysis;
