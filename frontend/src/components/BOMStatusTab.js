import React, { useState } from 'react';
import './BOMStatusTab.css';

function getRiskColor(score) {
  if (score >= 7) return '#CC0000';
  if (score >= 4) return '#0066CC';
  return '#00AA00';
}

function getRiskLabel(score) {
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

const fmt = n => n != null
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
  : 'N/A';

export default function BOMStatusTab({ bomData, expandedRows, onToggleExpand, onSelectPart }) {
  const [filterByRisk, setFilterByRisk] = useState('all');

  const highCount   = bomData.filter(p => p.risk_level === 'High').length;
  const mediumCount = bomData.filter(p => p.risk_level === 'Medium').length;
  const lowCount    = bomData.filter(p => p.risk_level === 'Low').length;

  const filtered = filterByRisk === 'all'
    ? bomData
    : bomData.filter(p => (p.risk_level || '').toLowerCase() === filterByRisk);

  return (
    <div className="bom-status-tab">
      <div className="tab-header">
        <div>
          <h2>Bill of Materials</h2>
          <p className="tab-description">{bomData.length} parts · Click any row to expand details</p>
        </div>
        <div className="bom-filter">
          <button className={`filter-btn ${filterByRisk === 'all' ? 'active' : ''}`} onClick={() => setFilterByRisk('all')}>
            All ({bomData.length})
          </button>
          <button className={`filter-btn filter-high ${filterByRisk === 'high' ? 'active' : ''}`} onClick={() => setFilterByRisk('high')}>
            High ({highCount})
          </button>
          <button className={`filter-btn filter-medium ${filterByRisk === 'medium' ? 'active' : ''}`} onClick={() => setFilterByRisk('medium')}>
            Medium ({mediumCount})
          </button>
          <button className={`filter-btn filter-low ${filterByRisk === 'low' ? 'active' : ''}`} onClick={() => setFilterByRisk('low')}>
            Low ({lowCount})
          </button>
        </div>
      </div>

      <div className="bom-table-wrapper">
        <table className="bom-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Part Name</th>
              <th>Manufacturer</th>
              <th>Country</th>
              <th>Lead Time</th>
              <th>Risk</th>
              <th>Unit Cost</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(part => (
              <React.Fragment key={part.part_id || part.part_name}>
                <tr
                  className={`bom-row ${expandedRows[part.part_id] ? 'expanded' : ''}`}
                  onClick={() => onToggleExpand(part.part_id)}
                >
                  <td className="expand-cell">
                    <span className={`expand-icon ${expandedRows[part.part_id] ? 'open' : ''}`}>▶</span>
                  </td>
                  <td className="col-part-name">{part.part_name}</td>
                  <td className="col-muted">{part.manufacturer}</td>
                  <td className="col-muted">{part.country}</td>
                  <td className="col-muted">{part.lead_time ? `${part.lead_time}w` : '—'}</td>
                  <td>
                    <span
                      className="risk-badge"
                      style={{ borderColor: getRiskColor(part.risk_score), color: getRiskColor(part.risk_score) }}
                    >
                      {(part.risk_score || 0).toFixed(1)}
                    </span>
                  </td>
                  <td className="col-muted">{part.unit_cost ? fmt(parseFloat(part.unit_cost)) : '—'}</td>
                </tr>

                {expandedRows[part.part_id] && (
                  <tr className="details-row">
                    <td colSpan="7">
                      <div className="details-content">
                        <div className="details-grid">
                          <div className="details-column">
                            <h4>Part Information</h4>
                            <div className="detail-item"><span className="dl">Part ID</span><span className="dv">{part.part_id || '—'}</span></div>
                            <div className="detail-item"><span className="dl">Part Name</span><span className="dv">{part.part_name}</span></div>
                            <div className="detail-item"><span className="dl">Manufacturer</span><span className="dv">{part.manufacturer}</span></div>
                            <div className="detail-item"><span className="dl">Country</span><span className="dv">{part.country}</span></div>
                          </div>

                          <div className="details-column">
                            <h4>Supply Chain</h4>
                            <div className="detail-item"><span className="dl">Lead Time</span><span className="dv">{part.lead_time ? `${part.lead_time} weeks` : '—'}</span></div>
                            <div className="detail-item">
                              <span className="dl">Risk Score</span>
                              <span className="dv" style={{ color: getRiskColor(part.risk_score) }}>
                                {(part.risk_score || 0).toFixed(1)}/10 ({getRiskLabel(part.risk_score || 0)})
                              </span>
                            </div>
                            <div className="detail-item"><span className="dl">Risk Region</span><span className="dv">{part.risk_region || '—'}</span></div>
                            <div className="detail-item"><span className="dl">Geo Risk</span><span className="dv">{part.geopolitical_risk != null ? `${part.geopolitical_risk}/10` : '—'}</span></div>
                          </div>

                          <div className="details-column">
                            <h4>Financial</h4>
                            <div className="detail-item"><span className="dl">Unit Cost</span><span className="dv">{part.unit_cost ? fmt(parseFloat(part.unit_cost)) : '—'}</span></div>
                            <div className="detail-item"><span className="dl">Quantity</span><span className="dv">{part.quantity || '—'}</span></div>
                            <div className="detail-item">
                              <span className="dl">Total Cost</span>
                              <span className="dv">
                                {part.unit_cost && part.quantity
                                  ? fmt(parseFloat(part.unit_cost) * parseFloat(part.quantity))
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="details-actions">
                          <button className="analyze-btn" onClick={e => { e.stopPropagation(); onSelectPart(part); }}>
                            ↗ View Risk Analysis
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
