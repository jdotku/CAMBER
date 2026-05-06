// ============================================================
// routes/scenarios.js — Scenario API endpoints (Phase 8)
// ============================================================

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { simulateScenario } = require('../utils/scenarioEngine');

const router = express.Router();

// Load pre-built templates once at startup
let scenarioTemplates = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, '../config/scenarios.json'), 'utf8');
  scenarioTemplates = JSON.parse(raw);
  console.log(`✓ Scenario templates loaded (${scenarioTemplates.length})`);
} catch (err) {
  console.error('✗ Failed to load scenario templates:', err.message);
}

// ============================================================
// GET /api/scenarios/templates
// Returns the list of pre-built scenarios the frontend displays
// as one-click buttons.
// ============================================================
router.get('/templates', (req, res) => {
  res.json({ success: true, templates: scenarioTemplates });
});

// ============================================================
// POST /api/scenarios/simulate
//
// Body: { bomData: [...], scenario: { type, regions, ... } }
// Runs the simulation engine and returns impact analysis.
// ============================================================
router.post('/simulate', async (req, res) => {
  try {
    const { bomData, scenario } = req.body;

    if (!bomData || !Array.isArray(bomData) || bomData.length === 0) {
      return res.status(400).json({ success: false, error: 'bomData must be a non-empty array.' });
    }
    if (!scenario || typeof scenario !== 'object' || !scenario.type) {
      return res.status(400).json({ success: false, error: 'scenario must include a "type" field.' });
    }

    console.log(`  Running scenario: ${scenario.type} (${bomData.length} parts)`);
    const result = await simulateScenario(bomData, scenario);

    console.log(
      `✓ /api/scenarios/simulate: ${result.affected_parts.length} affected, ` +
      `risk ${result.original_metrics.avg_risk} → ${result.scenario_metrics.avg_risk}`
    );

    res.json({ success: true, ...result });

  } catch (err) {
    console.error('✗ /api/scenarios/simulate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
