import React from 'react';
import './RiskTable.css';

// Derive a plausible live stock status from risk level — placeholder for real inventory API
function getLiveStatus(part) {
  const level = (part.risk_level || '').toLowerCase();
  if (level === 'high')   return { label: 'Lead Time 12+ Wks', cls: 'long-lead' };
  if (level === 'medium') return { label: 'Available (4 Wks)',  cls: 'available' };
  return { label: 'In Stock', cls: 'in-stock' };
}

function RiskTable({ data, onSelectAlternative, showLiveStatus, showAlternativeButton }) {

  function getRiskClass(riskLevel) {
    if (riskLevel === 'High')   return 'risk-high';
    if (riskLevel === 'Medium') return 'risk-medium';
    return 'risk-low';
  }

  function getScoreLevel(score) {
    const n = parseFloat(score) || 0;
    if (n > 6) return 'high';
    if (n > 3) return 'medium';
    return 'low';
  }

  function lineTotal(part) {
    const qty  = parseFloat(part.quantity)  || 0;
    const cost = parseFloat(part.unit_cost) || 0;
    return (qty * cost).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function truncate(text, maxLen = 55) {
    if (!text || text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '…';
  }

  const hasAlternatives = part => part.alternatives && part.alternatives.length > 0;

  return (
    <div className="table-wrapper">
      <table className="risk-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Part Name</th>
            <th>Manufacturer</th>
            <th>Country</th>
            <th>Qty</th>
            <th>Line Total</th>
            <th>Risk Score</th>
            <th>News Impact</th>
            <th>Risk Factors</th>
            <th>Level</th>
            {showLiveStatus && <th>Live Status</th>}
            {showAlternativeButton && <th>Alt Available</th>}
            <th>Recommendation</th>
            {showAlternativeButton && <th></th>}
          </tr>
        </thead>
        <tbody>
          {data.map((part, index) => {
            const rowId      = part.part_id || index;
            const riskClass  = getRiskClass(part.risk_level || 'Low');
            const scoreLevel = getScoreLevel(part.risk_score);
            const factorText = (part.risk_factors || []).join(' · ') || '—';
            const liveStatus = getLiveStatus(part);
            const altAvail   = hasAlternatives(part);
            const isHigh     = (part.risk_level || '') === 'High';

            return (
              <tr key={rowId} className={`table-row row-${riskClass}`}>
                <td className="col-id">{part.part_id}</td>
                <td className="col-name">{part.part_name}</td>
                <td>{part.manufacturer}</td>
                <td className="col-country">{part.country}</td>
                <td className="col-number">{part.quantity}</td>
                <td className="col-number">{lineTotal(part)}</td>
                <td className="col-number">
                  <span className={`score-badge score-${scoreLevel}`}>
                    {part.risk_score != null ? `${part.risk_score}/10` : '—'}
                  </span>
                </td>
                <td className="col-keywords">
                  {part.news_keywords && part.news_keywords.length > 0 ? (
                    <div className="keyword-pills">
                      {part.news_keywords.slice(0, 3).map((kw, i) => (
                        <span key={i} className={`kw-pill kw-${kw.category}`}>{kw.word}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="kw-none">—</span>
                  )}
                </td>
                <td className="col-factors">{truncate(factorText, 45)}</td>
                <td>
                  <span className={`risk-badge ${riskClass}`}>
                    {(part.risk_level || 'LOW').toUpperCase()}
                  </span>
                </td>
                {showLiveStatus && (
                  <td>
                    <span className={`live-status ${liveStatus.cls}`}>{liveStatus.label}</span>
                  </td>
                )}
                {showAlternativeButton && (
                  <td className="col-alt-avail">
                    {altAvail
                      ? <span className="alt-yes">Yes</span>
                      : <span className="alt-no">—</span>}
                  </td>
                )}
                <td className="col-rec">{truncate(part.recommendation, 60)}</td>
                {showAlternativeButton && (
                  <td>
                    {isHigh && onSelectAlternative && (
                      <button
                        className="find-alternative-btn"
                        onClick={() => onSelectAlternative(part.part_id)}
                      >
                        Find Alternative
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {data.length === 0 && (
        <p className="empty-state">No parts to display.</p>
      )}
    </div>
  );
}

export default RiskTable;
