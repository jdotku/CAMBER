import React, { useState, useEffect } from 'react';
import './DeepModeClaude.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function DeepModeClaude({ bomData, activeTab, selectedPart }) {
  const [claudeContext, setClaudeContext] = useState(null);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    if (activeTab === 'risk-alternatives' && selectedPart) {
      fetchPartAnalysis();
    } else if (activeTab === 'supply-network') {
      fetchNetworkAnalysis();
    } else if (activeTab === 'bom-status') {
      fetchBOMContextAnalysis();
    }
  }, [activeTab, selectedPart, bomData]);

  async function fetchPartAnalysis() {
    if (!selectedPart) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/claude-part-analysis`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ part: selectedPart, allParts: bomData }),
      });
      const data = await res.json();
      if (data.success) setClaudeContext(data.analysis);
    } catch (err) {
      console.error('DeepModeClaude part analysis error:', err);
    }
    setLoading(false);
  }

  async function fetchNetworkAnalysis() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/claude-network-analysis`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bomData }),
      });
      const data = await res.json();
      if (data.success) setClaudeContext(data.analysis);
    } catch (err) {
      console.error('DeepModeClaude network analysis error:', err);
    }
    setLoading(false);
  }

  async function fetchBOMContextAnalysis() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/claude-bom-context`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bomData }),
      });
      const data = await res.json();
      if (data.success) setClaudeContext(data.analysis);
    } catch (err) {
      console.error('DeepModeClaude BOM context error:', err);
    }
    setLoading(false);
  }

  if (!claudeContext && !loading) return null;

  return (
    <div className="deep-claude-insights">
      {loading ? (
        <div className="insight-loading">Claude is analyzing...</div>
      ) : claudeContext ? (
        <>
          {claudeContext.context && (
            <div className="insight-box context-box">
              <h4>CONTEXT</h4>
              <p>{claudeContext.context}</p>
            </div>
          )}

          {claudeContext.newsTrails && claudeContext.newsTrails.length > 0 && (
            <div className="insight-box news-box">
              <h4>NEWS DRIVERS</h4>
              <div className="news-trails">
                {claudeContext.newsTrails.map((trail, idx) => (
                  <div key={idx} className="news-trail">
                    <span className={`news-badge impact-${(trail.impact || 'medium').toLowerCase()}`}>
                      {trail.impact}
                    </span>
                    <p>{trail.headline}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {claudeContext.recommendation && (
            <div className="insight-box insight-recommendation-box">
              <h4>CLAUDE'S INSIGHT</h4>
              <p>{claudeContext.recommendation}</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
