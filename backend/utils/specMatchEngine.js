// Spec-Match Engine
// MVP: returns mock alternatives ranked by risk score.
// Production path: parse part specs with Claude → query DigiKey/internal DB → filter pin-compatible.

const partsDatabase = [
  {
    id: 'ALT-001',
    part_name: 'Intel Xeon Platinum 8380',
    manufacturer: 'Intel',
    country: 'USA',
    risk_score: 1.5,
    risk_level: 'Low',
    cost: 8500,
    lead_time: '4 weeks',
    availability: '2,400 in stock',
    specs: { voltage: '5V', pins: 64, package: 'LQFP' },
  },
  {
    id: 'ALT-002',
    part_name: 'AMD EPYC 7003 Series',
    manufacturer: 'AMD',
    country: 'USA',
    risk_score: 2.1,
    risk_level: 'Low',
    cost: 7800,
    lead_time: '3 weeks',
    availability: '1,800 in stock',
    specs: { voltage: '5V', pins: 64, package: 'LQFP' },
  },
  {
    id: 'ALT-003',
    part_name: 'Qualcomm Snapdragon X Elite',
    manufacturer: 'Qualcomm',
    country: 'USA',
    risk_score: 2.4,
    risk_level: 'Low',
    cost: 4200,
    lead_time: '6 weeks',
    availability: '950 in stock',
    specs: { voltage: '3.3V', pins: 48, package: 'BGA' },
  },
  {
    id: 'ALT-004',
    part_name: 'Broadcom BCM2712',
    manufacturer: 'Broadcom',
    country: 'USA',
    risk_score: 2.8,
    risk_level: 'Low',
    cost: 3100,
    lead_time: '5 weeks',
    availability: '3,200 in stock',
    specs: { voltage: '3.3V', pins: 48, package: 'BGA' },
  },
  {
    id: 'ALT-005',
    part_name: 'Texas Instruments TDA4VM',
    manufacturer: 'Texas Instruments',
    country: 'USA',
    risk_score: 1.8,
    risk_level: 'Low',
    cost: 5600,
    lead_time: '8 weeks',
    availability: '620 in stock',
    specs: { voltage: '5V', pins: 56, package: 'LQFP' },
  },
  {
    id: 'ALT-006',
    part_name: 'NXP i.MX 95',
    manufacturer: 'NXP Semiconductors',
    country: 'Netherlands',
    risk_score: 2.2,
    risk_level: 'Low',
    cost: 3900,
    lead_time: '6 weeks',
    availability: '1,100 in stock',
    specs: { voltage: '3.3V', pins: 52, package: 'BGA' },
  },
  {
    id: 'ALT-007',
    part_name: 'STMicroelectronics STM32H7',
    manufacturer: 'STMicroelectronics',
    country: 'France',
    risk_score: 2.5,
    risk_level: 'Low',
    cost: 890,
    lead_time: '4 weeks',
    availability: '8,400 in stock',
    specs: { voltage: '3.3V', pins: 32, package: 'LQFP' },
  },
  {
    id: 'ALT-008',
    part_name: 'Microchip PIC32MZ EF',
    manufacturer: 'Microchip Technology',
    country: 'USA',
    risk_score: 1.6,
    risk_level: 'Low',
    cost: 1200,
    lead_time: '3 weeks',
    availability: '5,600 in stock',
    specs: { voltage: '3.3V', pins: 32, package: 'QFN' },
  },
];

function findAlternatives(part, maxResults = 5) {
  const alternatives = partsDatabase
    .filter(alt => alt.part_name !== part.part_name)
    .sort((a, b) => a.risk_score - b.risk_score)
    .slice(0, maxResults)
    .map(alt => ({
      ...alt,
      risk_level: alt.risk_score < 3 ? 'Low' : alt.risk_score < 6 ? 'Medium' : 'High',
    }));

  return alternatives;
}

module.exports = { findAlternatives };
