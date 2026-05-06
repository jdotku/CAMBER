import React, { useState, useEffect } from 'react';
import './DeepModeLayout.css';
import SidebarNavigation from './SidebarNavigation';
import BOMStatusTab      from './BOMStatusTab';
import RiskAlternativesTab from './RiskAlternativesTab';
import SupplyNetworkTab  from './SupplyNetworkTab';
import ExportAuditTab    from './ExportAuditTab';

function calculateMetrics(data) {
  const highCount   = data.filter(p => p.risk_level === 'High').length;
  const mediumCount = data.filter(p => p.risk_level === 'Medium').length;
  const lowCount    = data.filter(p => p.risk_level === 'Low').length;
  const totalCost   = data.reduce((s, p) => s + (parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0), 0);
  const totalScore  = data.reduce((s, p) => s + (parseFloat(p.risk_score) || 0), 0);
  const avgRisk     = data.length > 0 ? totalScore / data.length : 0;
  const highParts   = data.filter(p => p.risk_level === 'High');
  return {
    totalParts:            data.length,
    highRiskCount:         highCount,
    mediumRiskCount:       mediumCount,
    lowRiskCount:          lowCount,
    totalCost,
    avgRisk,
    averageRiskScore:      avgRisk,
    supplyChainsAffected:  [...new Set(highParts.map(p => p.manufacturer))],
    topRisks:              [...data].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 5),
  };
}

export default function DeepModeLayout({ bomData, onBackToSummary, onReset }) {
  const [activeTab,    setActiveTab]    = useState('bom-status');
  const [selectedPart, setSelectedPart] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const metrics = calculateMetrics(bomData);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  function toggleRowExpansion(partId) {
    setExpandedRows(prev => ({ ...prev, [partId]: !prev[partId] }));
  }

  function handlePartSelect(part) {
    setSelectedPart(part);
    setActiveTab('risk-alternatives');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="deep-mode-layout">
      <SidebarNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBackToSummary={onBackToSummary}
        onReset={onReset}
      />

      <div className="deep-mode-content">
        <div className="content-container">
          {activeTab === 'bom-status' && (
            <BOMStatusTab
              bomData={bomData}
              expandedRows={expandedRows}
              onToggleExpand={toggleRowExpansion}
              onSelectPart={handlePartSelect}
            />
          )}
          {activeTab === 'risk-alternatives' && (
            <RiskAlternativesTab
              bomData={bomData}
              selectedPart={selectedPart}
            />
          )}
          {activeTab === 'supply-network' && (
            <SupplyNetworkTab bomData={bomData} />
          )}
          {activeTab === 'export-audit' && (
            <ExportAuditTab bomData={bomData} metrics={metrics} />
          )}
        </div>
      </div>
    </div>
  );
}
