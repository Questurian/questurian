/**
 * Demo: Brazil Tourism Zone Extraction
 *
 * This script demonstrates the Brazil-specific logic that prioritizes
 * tourism zones from the informative array over administrative districts.
 */

import { DistrictExtractionService } from '../services/geocoding/district-extraction.service';
import type { AdministrativeLevel, InformativeLevel } from '@server/shared/services/external/bigdatacloud-api.client';

console.log('\n🇧🇷 Brazil Tourism Zone Extraction Demo\n');
console.log('='.repeat(80));

const service = new DistrictExtractionService();

// Mock administrative data (bairro at adminLevel 8)
const mockAdmin: AdministrativeLevel[] = [
  { name: 'Brazil', adminLevel: 2 },
  { name: 'Rio de Janeiro', adminLevel: 4 },
  { name: 'Copacabana', adminLevel: 8 },
];

// Scenario 1: Tourism zone found (Zona Sul)
console.log('\n📍 Scenario 1: Tourism zone found in informative array');
console.log('   Location: Copacabana, Rio de Janeiro');
const informative1: InformativeLevel[] = [
  { name: 'South Zone of Rio de Janeiro' },
  { name: 'Atlantic Ocean' },
];
const result1 = service.extractDistrict('BR', mockAdmin, informative1);
console.log(`   Informative data: ["${informative1.map(i => i.name).join('", "')}"]`);
console.log(`   ✅ Result: ${result1}`);
console.log(`   Explanation: Found "South Zone" → normalized to "Zona Sul"`);

// Scenario 2: Different zone (Centro)
console.log('\n📍 Scenario 2: Central zone found');
console.log('   Location: Downtown Rio de Janeiro');
const informative2: InformativeLevel[] = [
  { name: 'Centro' },
  { name: 'Rio de Janeiro' },
];
const result2 = service.extractDistrict('BR', mockAdmin, informative2);
console.log(`   Informative data: ["${informative2.map(i => i.name).join('", "')}"]`);
console.log(`   ✅ Result: ${result2}`);
console.log(`   Explanation: Found "Centro" → kept as "Centro"`);

// Scenario 3: No zone found, fallback to bairro
console.log('\n📍 Scenario 3: No tourism zone, fallback to bairro');
console.log('   Location: Copacabana (no zone data available)');
const informative3: InformativeLevel[] = [
  { name: 'Atlantic Ocean' },
  { name: 'South America' },
];
const result3 = service.extractDistrict('BR', mockAdmin, informative3);
console.log(`   Informative data: ["${informative3.map(i => i.name).join('", "')}"]`);
console.log(`   ✅ Result: ${result3}`);
console.log(`   Explanation: No zone found → fallback to adminLevel 8 bairro "Copacabana"`);

// Scenario 4: All 5 standard zones
console.log('\n📍 Scenario 4: All 5 standard tourism zones');
const zones = [
  { informative: [{ name: 'South Zone' }], expected: 'Zona Sul' },
  { informative: [{ name: 'North Zone' }], expected: 'Zona Norte' },
  { informative: [{ name: 'West Zone' }], expected: 'Zona Oeste' },
  { informative: [{ name: 'Centro' }], expected: 'Centro' },
  { informative: [{ name: 'Ilhas' }], expected: 'Ilhas' },
];

zones.forEach(({ informative, expected }) => {
  const result = service.extractDistrict('BR', mockAdmin, informative);
  const match = result === expected ? '✅' : '❌';
  console.log(`   ${match} "${informative[0]!.name}" → "${result}" (expected: "${expected}")`);
});

// Scenario 5: Case-insensitive and partial matching
console.log('\n📍 Scenario 5: Case-insensitive & partial matching');
const partialMatches = [
  { name: 'SOUTH ZONE', expected: 'Zona Sul' },
  { name: 'south zone of rio de janeiro', expected: 'Zona Sul' },
  { name: 'Zona Sul', expected: 'Zona Sul' },
  { name: 'zona sul', expected: 'Zona Sul' },
  { name: 'Central Zone', expected: 'Centro' },
  { name: 'downtown', expected: 'Centro' },
];

partialMatches.forEach(({ name, expected }) => {
  const result = service.extractDistrict('BR', mockAdmin, [{ name }]);
  const match = result === expected ? '✅' : '❌';
  console.log(`   ${match} "${name}" → "${result}"`);
});

console.log('\n' + '='.repeat(80));
console.log('\n💡 Key Takeaways:');
console.log('   1. Brazil prioritizes tourism zones from informative array');
console.log('   2. Zones are normalized to 5 standard labels (Zona Sul, Zona Norte, Zona Oeste, Centro, Ilhas)');
console.log('   3. Matching is case-insensitive and supports partial matches');
console.log('   4. Falls back to bairro from adminLevel 8 when no zone found');
console.log('   5. Peru and Colombia continue using adminLevel 8 (unchanged)\n');
