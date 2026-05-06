// ============================================================
// ExportButton.js — Report Export (Phase 7)
//
// WHY export matters:
//   A PM doesn't live in this dashboard — they need to share
//   findings with procurement, finance, and leadership.
//   CSV → drops into Excel/Sheets for further analysis.
//   JSON → feeds other tools or historical comparison.
//   PDF  → send to a VP who won't install anything.
//
// All three use zero external libraries: Blob + createObjectURL
// for file downloads, and window.print() for PDF.
// ============================================================

import React, { useState } from 'react';
import './ExportButton.css';

function ExportButton({ bomData, metrics }) {
  const [lastDownload, setLastDownload] = useState(null);

  const dateStr = new Date().toISOString().split('T')[0];

  // ---- trigger a browser file download ----
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setLastDownload(filename);
    setTimeout(() => setLastDownload(null), 3000);
  }

  // ---- CSV ----
  function exportAsCSV() {
    const headers = [
      'Part Name', 'Part Number', 'Manufacturer', 'Country',
      'Risk Region', 'Quantity', 'Unit Cost', 'Line Total',
      'Risk Score', 'Risk Level', 'Recommendation Source', 'Recommendation',
    ];

    const rows = bomData.map(p => {
      const lineCost = (parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0);
      // Wrap strings in quotes and escape any internal quotes
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        esc(p.part_name),
        esc(p.part_number || ''),
        esc(p.manufacturer),
        esc(p.country),
        esc(p.risk_region),
        p.quantity,
        p.unit_cost,
        lineCost.toFixed(2),
        p.risk_score,
        p.risk_level,
        p.recommendation_source,
        esc(p.recommendation),
      ].join(',');
    });

    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    download(blob, `CAMBER_BOM_${dateStr}.csv`);
  }

  // ---- JSON ----
  function exportAsJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      metrics,
      parts: bomData,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    download(blob, `CAMBER_Report_${dateStr}.json`);
  }

  // ---- PDF (Print to PDF) ----
  // Opens a pre-styled HTML page in a new window and triggers the
  // browser print dialog. The user saves it as PDF from there.
  // No library needed — browser rendering handles layout.
  function exportAsPDF() {
    const high   = bomData.filter(p => p.risk_level === 'High');
    const medium = bomData.filter(p => p.risk_level === 'Medium');
    const low    = bomData.filter(p => p.risk_level === 'Low');

    const fmt = n => new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    }).format(n);

    const rowsHTML = bomData.map(p => {
      const color = p.risk_level === 'High' ? '#cc0000'
                  : p.risk_level === 'Medium' ? '#cc7700' : '#006633';
      const lineCost = (parseFloat(p.quantity) || 0) * (parseFloat(p.unit_cost) || 0);
      return `
        <tr>
          <td>${p.part_name}</td>
          <td>${p.manufacturer}</td>
          <td>${p.country}</td>
          <td>${p.quantity}</td>
          <td>${fmt(lineCost)}</td>
          <td style="color:${color};font-weight:700">${p.risk_score}/10</td>
          <td style="color:${color};font-weight:700">${p.risk_level}</td>
          <td style="font-size:10px">${(p.recommendation || '').substring(0, 120)}${p.recommendation?.length > 120 ? '…' : ''}</td>
        </tr>`;
    }).join('');

    const criticalHTML = high.length === 0
      ? '<p style="color:#666">No critical parts.</p>'
      : high.map(p => `
          <div style="border-left:4px solid #cc0000;padding:10px 14px;margin-bottom:10px;background:#fff5f5">
            <strong style="color:#cc0000">${p.part_name}</strong> — ${p.manufacturer} (${p.country})<br>
            <small>${(p.recommendation || '').substring(0, 200)}</small>
          </div>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CAMBER Risk Report — ${dateStr}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a2e; padding: 32px; }
    h1   { font-size: 22px; color: #0066cc; border-bottom: 2px solid #0066cc; padding-bottom: 8px; }
    h2   { font-size: 14px; color: #333; text-transform: uppercase; letter-spacing: 1px; margin-top: 28px; }
    .metrics { display: flex; gap: 24px; margin: 16px 0 28px; }
    .metric  { border: 1px solid #ddd; border-radius: 6px; padding: 12px 18px; min-width: 110px; text-align: center; }
    .metric .label { font-size: 10px; text-transform: uppercase; color: #888; }
    .metric .val   { font-size: 22px; font-weight: bold; margin-top: 4px; }
    table  { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th     { background: #0066cc; color: white; padding: 8px 10px; font-size: 10px; text-align: left; }
    td     { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9f9; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>CAMBER — Supply Chain Risk Report</h1>
  <p style="color:#666">Generated: ${new Date().toLocaleString()} · ${bomData.length} parts analyzed</p>

  <div class="metrics">
    <div class="metric"><div class="label">Total Parts</div><div class="val">${metrics.totalParts}</div></div>
    <div class="metric"><div class="label">BOM Cost</div><div class="val" style="font-size:16px">${fmt(metrics.totalCost)}</div></div>
    <div class="metric"><div class="label">Avg Risk</div><div class="val" style="color:#cc7700">${metrics.averageRiskScore.toFixed(1)}/10</div></div>
    <div class="metric"><div class="label">Critical</div><div class="val" style="color:#cc0000">${high.length}</div></div>
    <div class="metric"><div class="label">Medium</div><div class="val" style="color:#cc7700">${medium.length}</div></div>
    <div class="metric"><div class="label">Stable</div><div class="val" style="color:#006633">${low.length}</div></div>
  </div>

  <h2>Critical Actions Required</h2>
  ${criticalHTML}

  <h2>Full Bill of Materials</h2>
  <table>
    <thead>
      <tr>
        <th>Part Name</th><th>Manufacturer</th><th>Country</th>
        <th>Qty</th><th>Line Cost</th><th>Risk Score</th>
        <th>Risk Level</th><th>Recommendation (excerpt)</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    // Small delay so the browser finishes rendering before print dialog opens
    setTimeout(() => win.print(), 400);
    setLastDownload('PDF print dialog opened');
    setTimeout(() => setLastDownload(null), 4000);
  }

  return (
    <div className="export-section">
      <button className="export-button" onClick={exportAsCSV}>
        ↓ Export CSV
      </button>
      <button className="export-button" onClick={exportAsJSON}>
        ↓ Export JSON
      </button>
      <button className="export-button pdf" onClick={exportAsPDF}>
        ↓ Export PDF
      </button>
      {lastDownload && (
        <span className="export-success">✓ {lastDownload}</span>
      )}
    </div>
  );
}

export default ExportButton;
