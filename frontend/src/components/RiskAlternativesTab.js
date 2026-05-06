import React, { useState, useEffect } from 'react';
import './RiskAlternativesTab.css';
import DeepModeClaude from './DeepModeClaude';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function RiskAlternativesTab({ bomData, preSelectedPartId, selectedPart: preSelectedPartObj }) {
  const highAndMedium = bomData.filter(p => p.risk_level !== 'Low');
  const initialPart = preSelectedPartObj
    || (preSelectedPartId ? bomData.find(p => String(p.part_id) === String(preSelectedPartId)) : null)
    || highAndMedium[0] || bomData[0] || null;

  const [selectedPart,        setSelectedPart]        = useState(initialPart);
  const [alternatives,        setAlternatives]        = useState([]);
  const [loading,             setLoading]             = useState(false);
  const [selectedAlternative, setSelectedAlternative] = useState(null);

  // Respond to external selection (from DeepModeLayout / BOMStatusTab "View Risk Analysis")
  useEffect(() => {
    if (preSelectedPartObj) setSelectedPart(preSelectedPartObj);
  }, [preSelectedPartObj]);

  // Legacy: respond to preSelectedPartId
  useEffect(() => {
    if (preSelectedPartId) {
      const part = bomData.find(p => String(p.part_id) === String(preSelectedPartId));
      if (part) setSelectedPart(part);
    }
  }, [preSelectedPartId, bomData]);

  useEffect(() => {
    if (selectedPart) {
      fetchAlternatives(selectedPart);
      setSelectedAlternative(null);
    }
  }, [selectedPart]);

  async function fetchAlternatives(part) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/spec-match/alternatives`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ part, maxAlternatives: 5 }),
      });
      const data = await res.json();
      setAlternatives(data.alternatives || []);
    } catch {
      setAlternatives([]);
    }
    setLoading(false);
  }

  const fmt = n => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);

  function costDelta(altCost, origCost) {
    const diff = ((altCost - origCost) / origCost) * 100;
    return diff > 0
      ? <span className="negative">+{diff.toFixed(1)}%</span>
      : <span className="positive">{diff.toFixed(1)}%</span>;
  }

  function riskDelta(altScore, origScore) {
    const reduction = ((origScore - altScore) / origScore * 100).toFixed(0);
    return <span className="positive">↓ {reduction}% ({origScore.toFixed(1)} → {altScore.toFixed(1)})</span>;
  }

  return (
    <div className="risk-alternatives-tab">
      <h2>Risk &amp; Alternatives</h2>

      <div className="alternatives-container">

        {/* LEFT: Part Selector */}
        <div className="part-selector">
          <h3>Select a Part</h3>
          {highAndMedium.length === 0 && (
            <p className="no-risky-parts">No high or medium risk parts.</p>
          )}
          <div className="part-list">
            {highAndMedium.map(part => (
              <div
                key={part.part_id}
                className={`part-card ${selectedPart?.part_id === part.part_id ? 'selected' : ''}`}
                onClick={() => setSelectedPart(part)}
              >
                <div className="part-card-name">{part.part_name}</div>
                <div className="part-card-mfg">{part.manufacturer}</div>
                <span className={`risk-badge-sm risk-${(part.risk_level || '').toLowerCase()}`}>
                  {part.risk_level} · {(part.risk_score || 0).toFixed(1)}/10
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail + Alternatives */}
        {selectedPart && (
          <div className="alternatives-display">

            {/* Current part details */}
            <div className="selected-part-details">
              <h3>{selectedPart.part_name}</h3>
              <div className="detail-row">
                <span className="label">Manufacturer</span>
                <span className="value">{selectedPart.manufacturer}</span>
              </div>
              <div className="detail-row">
                <span className="label">Country</span>
                <span className="value">{selectedPart.country}</span>
              </div>
              <div className="detail-row">
                <span className="label">Risk Score</span>
                <span className={`value risk-text-${(selectedPart.risk_level || '').toLowerCase()}`}>
                  {(selectedPart.risk_score || 0).toFixed(1)}/10
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Unit Cost</span>
                <span className="value">{fmt(parseFloat(selectedPart.unit_cost) || 0)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Lead Time</span>
                <span className="value">12 weeks (est.)</span>
              </div>
              {selectedPart.recommendation && (
                <div className="recommendation-box">
                  <p>{selectedPart.recommendation}</p>
                </div>
              )}
            </div>

            {/* Alternatives */}
            <div className="alternatives-section">
              <h3>Spec-Compatible Alternatives</h3>
              {loading ? (
                <p className="loading-msg">Finding alternatives...</p>
              ) : alternatives.length > 0 ? (
                <div className="alternative-cards">
                  {alternatives.map((alt, idx) => (
                    <div
                      key={alt.id || idx}
                      className={`alternative-card ${selectedAlternative?.id === alt.id ? 'selected' : ''}`}
                      onClick={() => setSelectedAlternative(alt)}
                    >
                      <div className="alt-header">
                        <span className="alt-name">{alt.part_name}</span>
                        <span className={`risk-badge-sm risk-${alt.risk_level.toLowerCase()}`}>
                          {alt.risk_score.toFixed(1)}/10
                        </span>
                      </div>

                      <div className="alt-spec-tags">
                        <span className="spec-match-tag">✓ Pin-Compatible</span>
                        <span className="spec-match-tag">{alt.availability}</span>
                      </div>

                      <div className="alt-details">
                        <div className="detail-row">
                          <span className="label">Manufacturer</span>
                          <span className="value">{alt.manufacturer}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Cost</span>
                          <span className="value">{fmt(alt.cost)}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Lead Time</span>
                          <span className="value">{alt.lead_time}</span>
                        </div>
                      </div>

                      <div className="alt-impact">
                        <div className="impact-title">Impact of Switching</div>
                        <div className="impact-row">
                          <span>Risk Reduction</span>
                          {riskDelta(alt.risk_score, selectedPart.risk_score || 0)}
                        </div>
                        <div className="impact-row">
                          <span>Cost Change</span>
                          {costDelta(alt.cost, parseFloat(selectedPart.unit_cost) || alt.cost)}
                        </div>
                        <div className="impact-row">
                          <span>Lead Time</span>
                          <span className="positive">12 wks → {alt.lead_time}</span>
                        </div>
                      </div>

                      <button
                        className="select-alt-btn"
                        onClick={e => { e.stopPropagation(); setSelectedAlternative(alt); }}
                      >
                        {selectedAlternative?.id === alt.id ? '✓ Selected' : 'Select This Alternative'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-alternatives">No alternatives found. This part may be unique.</p>
              )}
            </div>

            {selectedAlternative && (
              <DeepModeClaude
                bomData={bomData}
                activeTab="risk-alternatives"
                selectedPart={selectedPart}
              />
            )}

          </div>
        )}
      </div>
    </div>
  );
}
