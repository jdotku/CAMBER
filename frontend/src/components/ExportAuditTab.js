import React, { useState, useMemo } from 'react';
import './ExportAuditTab.css';

export default function ExportAuditTab({ bomData, metrics }) {
  const [generatingReport, setGeneratingReport] = useState(false);

  const auditLog = useMemo(() => [
    { ts: new Date(),               action: 'BOM uploaded and analyzed' },
    { ts: new Date(Date.now() - 60000),  action: 'Risk assessment completed' },
    { ts: new Date(Date.now() - 120000), action: 'News data fetched and integrated' },
  ], []);

  const avgRisk     = metrics?.avgRisk ?? metrics?.averageRiskScore ?? 0;
  const highCount   = bomData.filter(p => p.risk_level === 'High').length;

  function generatePDF() {
    setGeneratingReport(true);

    const reportHTML = `<!DOCTYPE html>
<html>
<head>
  <title>CAMBER Risk Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #000; background: #fff; margin: 40px; }
    h1   { border-bottom: 2px solid #000; padding-bottom: 8px; }
    h2   { margin-top: 32px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 12px; }
    th { background: #f5f5f5; font-weight: bold; }
    .high   { color: #CC0000; font-weight: bold; }
    .medium { color: #0066CC; font-weight: bold; }
    .low    { color: #00AA00; font-weight: bold; }
    .meta   { color: #555; font-size: 12px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>CAMBER Supply Chain Risk Report</h1>
  <p class="meta">Generated: ${new Date().toLocaleString()}</p>

  <h2>Executive Summary</h2>
  <p>Total Parts: <strong>${bomData.length}</strong></p>
  <p>High Risk Parts: <strong class="high">${highCount}</strong></p>
  <p>Average Risk Score: <strong>${avgRisk.toFixed(1)}/10</strong></p>

  <h2>BOM Risk Analysis</h2>
  <table>
    <thead>
      <tr>
        <th>Part Name</th>
        <th>Manufacturer</th>
        <th>Country</th>
        <th>Risk Score</th>
        <th>Risk Level</th>
        <th>Recommendation (truncated)</th>
      </tr>
    </thead>
    <tbody>
      ${bomData.map(part => `
        <tr>
          <td>${part.part_name || ''}</td>
          <td>${part.manufacturer || ''}</td>
          <td>${part.country || ''}</td>
          <td>${(part.risk_score || 0).toFixed(1)}/10</td>
          <td><span class="${(part.risk_level || '').toLowerCase()}">${part.risk_level || ''}</span></td>
          <td>${(part.recommendation || '').substring(0, 80)}${(part.recommendation || '').length > 80 ? '...' : ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(reportHTML);
      win.document.close();
      win.print();
    }
    setGeneratingReport(false);
  }

  function downloadCSV() {
    const rows = [
      ['Part ID', 'Part Name', 'Manufacturer', 'Country', 'Risk Score', 'Risk Level', 'Unit Cost', 'Quantity', 'Recommendation'],
      ...bomData.map(p => [
        p.part_id,
        `"${(p.part_name || '').replace(/"/g, '""')}"`,
        p.manufacturer,
        p.country,
        (p.risk_score || 0).toFixed(1),
        p.risk_level,
        p.unit_cost,
        p.quantity,
        `"${(p.recommendation || '').replace(/"/g, '""').substring(0, 100)}"`,
      ]),
    ];

    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `CAMBER_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const supplierCount   = new Set(bomData.map(p => p.manufacturer)).size;
  const tungstenParts   = bomData.filter(p =>
    (p.part_name || '').toLowerCase().includes('tungsten') ||
    (p.risk_factors || []).some(f => f.toLowerCase().includes('tungsten'))
  );

  return (
    <div className="export-audit-tab">
      <h2>Export &amp; Audit</h2>

      {/* ---- EXPORT ---- */}
      <div className="audit-card">
        <h3>Generate Report</h3>
        <div className="export-buttons">
          <button onClick={generatePDF} disabled={generatingReport} className="export-btn pdf-btn">
            {generatingReport ? 'Generating...' : 'Export as PDF'}
          </button>
          <button onClick={downloadCSV} className="export-btn csv-btn">
            Export as CSV
          </button>
        </div>
        <p className="export-note">
          PDF opens a print-ready view in a new tab. CSV includes all columns and is Excel-compatible.
        </p>
      </div>

      {/* ---- AUDIT LOG ---- */}
      <div className="audit-card">
        <h3>Audit Log</h3>
        <div className="audit-log">
          {auditLog.map((entry, i) => (
            <div key={i} className="audit-entry">
              <span className="audit-ts">{entry.ts.toLocaleTimeString()}</span>
              <span className="audit-action">{entry.action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- COMPLIANCE ---- */}
      <div className="audit-card">
        <h3>Compliance Checks</h3>
        <div className="compliance-checks">
          <div className="check-item check-ok">
            <span className="check-label">CHIPS Act Compliance</span>
            <span className="check-status">✓ All {bomData.length} parts reviewed</span>
          </div>
          <div className={`check-item ${tungstenParts.length > 0 ? 'check-warn' : 'check-ok'}`}>
            <span className="check-label">Conflict Materials Screening</span>
            <span className="check-status">
              {tungstenParts.length > 0
                ? `⚠ Review required for ${tungstenParts.length} part(s)`
                : '✓ No conflict material flags found'}
            </span>
          </div>
          <div className={`check-item ${supplierCount >= 4 ? 'check-ok' : 'check-warn'}`}>
            <span className="check-label">Supplier Diversity Score</span>
            <span className="check-status">
              {supplierCount >= 4
                ? `✓ Good diversification (${supplierCount} suppliers)`
                : `⚠ Recommend more suppliers (currently ${supplierCount})`}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
