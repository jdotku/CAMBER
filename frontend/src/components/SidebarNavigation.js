import React from 'react';
import './SidebarNavigation.css';

const TABS = [
  { id: 'bom-status',        label: 'BOM Status',         icon: '▤', description: 'View and manage your bill of materials' },
  { id: 'risk-alternatives', label: 'Risk & Alternatives', icon: '⚑', description: 'Analyze risks and find alternatives'      },
  { id: 'supply-network',    label: 'Supply Network',      icon: '◈', description: 'View your supply chain network'           },
  { id: 'export-audit',      label: 'Export & Audit',      icon: '↗', description: 'Export reports and audit logs'            },
];

export default function SidebarNavigation({ activeTab, onTabChange, onBackToSummary, onReset }) {
  return (
    <div className="sidebar-navigation">
      <div className="sidebar-header">
        <div className="sidebar-logo">CAMBER</div>
        <button className="back-button" onClick={onBackToSummary} title="Back to summary">
          ← Back
        </button>
      </div>

      <div className="tab-list">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            title={tab.description}
          >
            <span className="tab-icon">{tab.icon}</span>
            <div className="tab-label">
              <span className="tab-name">{tab.label}</span>
              <span className="tab-desc">{tab.description}</span>
            </div>
            {activeTab === tab.id && <div className="tab-indicator" />}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        {onReset && (
          <button className="new-bom-btn" onClick={onReset}>
            + New BOM
          </button>
        )}
        <div className="version-info">v1.0 Beta</div>
      </div>
    </div>
  );
}
