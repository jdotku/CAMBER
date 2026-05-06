import React, { useState, useEffect } from 'react';
import './SimpleDashboard.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function SimpleDashboard({ bomData, healthData, onExploreMore, onAcceptFix, onExport }) {
  const [claudeInsights, setClaudeInsights] = useState(null);
  const [loadingClaude,  setLoadingClaude]  = useState(false);
  const [acceptingFix,   setAcceptingFix]   = useState(false);

  useEffect(() => {
    if (!healthData) return;
    setLoadingClaude(true);
    fetch(`${API_BASE}/api/bom-analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        bomData,
        baseHealthScore: healthData.health.healthScore,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.success) setClaudeInsights(data.analysis); })
      .catch(err => console.error('Error fetching Claude analysis:', err))
      .finally(() => setLoadingClaude(false));
  }, [bomData, healthData]);

  const getHealthColor = score => {
    switch (score) {
      case 'Green':  return '#00AA00';
      case 'Yellow': return '#0066CC';
      case 'Red':    return '#CC0000';
      default:       return '#999999';
    }
  };

  const getHealthText = score => {
    switch (score) {
      case 'Green':  return 'HEALTHY';
      case 'Yellow': return 'CAUTION';
      case 'Red':    return 'ACTION NEEDED';
      default:       return 'UNKNOWN';
    }
  };

  const handleAcceptFix = () => {
    setAcceptingFix(true);
    onAcceptFix(claudeInsights);
    setTimeout(() => setAcceptingFix(false), 2000);
  };

  return (
    <div className="simple-dashboard">
      <div className="dashboard-container">

        {/* HEADER */}
        <div className="simple-header">
          <h1>CAMBER</h1>
          <p className="subtitle">Supply Chain Risk Intelligence</p>
        </div>

        {/* TWO-COLUMN LAYOUT */}
        <div className="dashboard-layout">

          {/* LEFT: Health Circle */}
          <div className="health-section">
            <div className="health-card">
              <div className="health-circle-wrapper">
                <div
                  className="health-circle"
                  style={{ borderColor: getHealthColor(healthData.health.healthScore) }}
                >
                  <span
                    className="health-status"
                    style={{ color: getHealthColor(healthData.health.healthScore) }}
                  >
                    {getHealthText(healthData.health.healthScore)}
                  </span>
                </div>
              </div>

              <div className="issue-summary">
                <h3>RISK SUMMARY</h3>
                <div className="issue-row">
                  <span className="issue-label">Critical</span>
                  <span className="issue-count critical">{healthData.health.issueCount.critical}</span>
                </div>
                <div className="issue-row">
                  <span className="issue-label">Medium</span>
                  <span className="issue-count medium">{healthData.health.issueCount.medium}</span>
                </div>
                <div className="issue-row">
                  <span className="issue-label">Low</span>
                  <span className="issue-count low">{healthData.health.issueCount.low}</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Claude Analysis */}
          <div className="analysis-section">
            {loadingClaude ? (
              <div className="analysis-card loading">
                <div className="loading-text">Analyzing your BOM...</div>
                <div className="loading-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            ) : claudeInsights ? (
              <div className="analysis-card">
                <div className="analysis-header">
                  <h2>AI ANALYSIS</h2>
                  <span className="confidence-badge">
                    {(claudeInsights.confidence * 100).toFixed(0)}% CONFIDENT
                  </span>
                </div>

                <div className="analysis-body">
                  <div className="analysis-section-item">
                    <h3>WHY THIS SCORE?</h3>
                    <p className="analysis-text">{claudeInsights.explanation}</p>
                  </div>

                  <div className="analysis-section-item recommendation-section">
                    <h3>RECOMMENDED FIX</h3>
                    <p className="recommendation-text">{claudeInsights.recommendation}</p>
                  </div>

                  {claudeInsights.warning && (
                    <div className="analysis-section-item warning-section">
                      <h3>⚠ IF NO ACTION:</h3>
                      <p className="warning-text">{claudeInsights.warning}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="analysis-card error">
                <p>Unable to load analysis</p>
              </div>
            )}
          </div>

        </div>

        {/* ACTION BUTTONS */}
        <div className="action-buttons">
          <button
            className="btn-primary"
            onClick={handleAcceptFix}
            disabled={acceptingFix || !claudeInsights}
          >
            {acceptingFix ? '✓ ACCEPTED' : 'ACCEPT RECOMMENDATION'}
          </button>
          <button className="btn-secondary" onClick={onExploreMore}>
            EXPLORE MORE OPTIONS →
          </button>
          <button className="btn-export" onClick={() => onExport('pdf')}>
            EXPORT REPORT
          </button>
        </div>

      </div>
    </div>
  );
}
