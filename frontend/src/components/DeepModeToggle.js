import React, { useState, useEffect } from 'react';
import SimpleDashboard from './SimpleDashboard';
import DeepModeLayout  from './DeepModeLayout';

const API_BASE_URL = 'http://localhost:5001';

export default function DeepModeToggle({ bomData, onReset }) {
  const [mode,       setMode]       = useState('simple');
  const [healthData, setHealthData] = useState(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/bom-health`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bomData }),
    })
      .then(r => r.json())
      .then(data => setHealthData(data))
      .catch(err => console.error('bom-health fetch failed:', err))
      .finally(() => setLoading(false));
  }, [bomData]);

  function handleExploreMore() {
    setMode('deep');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBackToSummary() {
    setMode('simple');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleAcceptFix(recommendation) {
    console.log('Accepting fix:', recommendation);
  }

  function handleExport(format) {
    if (format !== 'pdf') return;
    const report = `<!DOCTYPE html>
<html>
<head>
  <title>CAMBER Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #000; background: #fff; padding: 20px; }
    h1 { border-bottom: 2px solid #000; padding-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 700; }
  </style>
</head>
<body>
  <h1>CAMBER Supply Chain Risk Report</h1>
  <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  <p><strong>Total Parts:</strong> ${bomData.length}</p>
  <h2>BOM Analysis</h2>
  <table>
    <thead><tr><th>Part Name</th><th>Manufacturer</th><th>Country</th><th>Risk Score</th></tr></thead>
    <tbody>
      ${bomData.map(p => `<tr><td>${p.part_name}</td><td>${p.manufacturer}</td><td>${p.country || '—'}</td><td>${(p.risk_score || 0).toFixed(1)}/10</td></tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;
    const win = window.open();
    win.document.write(report);
    win.document.close();
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000' }}>
        <div style={{ textAlign: 'center', color: '#555555' }}>
          <div style={{ fontSize: 28, marginBottom: 12, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'Courier New' }}>Analyzing BOM...</div>
        </div>
      </div>
    );
  }

  if (mode === 'simple') {
    return (
      <SimpleDashboard
        bomData={bomData}
        healthData={healthData}
        onExploreMore={handleExploreMore}
        onAcceptFix={handleAcceptFix}
        onExport={handleExport}
      />
    );
  }

  return (
    <DeepModeLayout
      bomData={bomData}
      onBackToSummary={handleBackToSummary}
      onReset={onReset}
    />
  );
}
