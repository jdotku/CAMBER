import React, { useMemo } from 'react';
import './SupplyNetworkTab.css';
import DeepModeClaude from './DeepModeClaude';

export default function SupplyNetworkTab({ bomData }) {
  const networkData = useMemo(() => {
    const manufacturers = [...new Set(bomData.map(p => p.manufacturer))];
    const regions       = [...new Set(bomData.map(p => p.country))];

    const partsByMfg = bomData.reduce((acc, part) => {
      if (!acc[part.manufacturer]) acc[part.manufacturer] = [];
      acc[part.manufacturer].push(part);
      return acc;
    }, {});

    const partsByRegion = bomData.reduce((acc, part) => {
      if (!acc[part.country]) acc[part.country] = [];
      acc[part.country].push(part);
      return acc;
    }, {});

    return { manufacturers, regions, partsByMfg, partsByRegion };
  }, [bomData]);

  function avgRisk(parts) {
    if (!parts.length) return 0;
    return parts.reduce((s, p) => s + (p.risk_score || 0), 0) / parts.length;
  }

  function riskLevel(score) {
    return score > 6 ? 'high' : score > 3 ? 'medium' : 'low';
  }

  const topMfg = Object.entries(networkData.partsByMfg)
    .sort(([, a], [, b]) => b.length - a.length)[0];
  const concentration = topMfg
    ? ((topMfg[1].length / bomData.length) * 100).toFixed(0)
    : 0;

  const concentrationInsight = networkData.manufacturers.length === 1
    ? `⚠ Critical: All ${bomData.length} parts from a single manufacturer. Recommend immediate supplier diversification.`
    : parseInt(concentration) > 50
    ? `⚠ High: ${topMfg?.[0]} supplies ${concentration}% of your BOM. Consider adding alternative suppliers.`
    : `✓ Acceptable: Manufacturer diversity is reasonable across ${networkData.manufacturers.length} suppliers.`;

  return (
    <div className="supply-network-tab">
      <h2>Supply Network</h2>

      {/* TIER VISUALIZATION */}
      <div className="network-viz">

        {/* Your product */}
        <div className="tier tier-you">
          <div className="tier-label">Your Product</div>
          <div className="node node-you">Your BOM · {bomData.length} parts</div>
        </div>

        <div className="tier-connector">▼</div>

        {/* Tier 1: Manufacturers */}
        <div className="tier tier-block">
          <div className="tier-label">Tier 1 — Manufacturers ({networkData.manufacturers.length})</div>
          <div className="nodes-grid">
            {networkData.manufacturers.map(mfg => {
              const parts = networkData.partsByMfg[mfg];
              const avg   = avgRisk(parts);
              const level = riskLevel(avg);
              return (
                <div key={mfg} className={`node node-mfg risk-border-${level}`}>
                  <div className="node-name">{mfg}</div>
                  <div className="node-meta">{parts.length} part{parts.length !== 1 ? 's' : ''}</div>
                  <div className={`node-risk risk-text-${level}`}>{avg.toFixed(1)}/10</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="tier-connector">▼</div>

        {/* Tier 2: Regions */}
        <div className="tier tier-block">
          <div className="tier-label">Tier 2 — Regions ({networkData.regions.length})</div>
          <div className="nodes-grid">
            {networkData.regions.map(region => {
              const parts = networkData.partsByRegion[region];
              const avg   = avgRisk(parts);
              const level = riskLevel(avg);
              return (
                <div key={region} className={`node node-region risk-border-${level}`}>
                  <div className="node-name">{region}</div>
                  <div className="node-meta">{parts.length} part{parts.length !== 1 ? 's' : ''}</div>
                  <div className={`node-risk risk-text-${level}`}>{avg.toFixed(1)}/10</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* CONCENTRATION ANALYSIS */}
      <div className="concentration-analysis">
        <div className="conc-header">
          <h3>Concentration Risk</h3>
        </div>
        <div className="analysis-cards">
          {Object.entries(networkData.partsByMfg)
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([mfg, parts]) => {
              const avg   = avgRisk(parts);
              const level = riskLevel(avg);
              const share = ((parts.length / bomData.length) * 100).toFixed(0);
              return (
                <div key={mfg} className={`analysis-card conc-border-${level}`}>
                  <div className="analysis-name">{mfg}</div>
                  <div className="analysis-share">{parts.length} parts · {share}% of BOM</div>
                  <div className={`analysis-risk risk-text-${level}`}>
                    Avg risk {avg.toFixed(1)}/10
                  </div>
                </div>
              );
            })}
        </div>
        <p className={`concentration-insight ${concentrationInsight.startsWith('⚠') ? 'insight-warn' : 'insight-ok'}`}>
          {concentrationInsight}
        </p>
      </div>

      <DeepModeClaude bomData={bomData} activeTab="supply-network" />

    </div>
  );
}
