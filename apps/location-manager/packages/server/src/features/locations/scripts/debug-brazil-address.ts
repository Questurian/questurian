/**
 * Debug: Check BigDataCloud response for specific Brazil address
 */

import { ServiceContainer } from '../container/service-container';
import { initDb } from '@server/shared/db/client';

async function debugBrazilAddress() {
  console.log('\n🔍 Debugging Brazil Address\n');
  console.log('='.repeat(80));

  // Initialize database
  initDb();

  const container = ServiceContainer.getInstance();

  // The specific address that failed
  const testAddress = {
    name: 'Enchendo Lingüiça',
    address: 'Av. Eng. Richard, 2 - Grajaú, Rio de Janeiro - RJ, 20561-090, Brazil',
  };

  console.log(`\n📍 Test Location:`);
  console.log(`   Name: ${testAddress.name}`);
  console.log(`   Address: ${testAddress.address}`);

  // First, let's geocode this address to get coordinates
  console.log(`\n⏳ Geocoding address...`);

  // We'll use a known coordinate for Grajaú, Rio de Janeiro
  // (In real scenario, this would come from Google Geocoding API)
  const coordinates = {
    lat: -22.9192,
    lng: -43.2642,
  };

  console.log(`\n📍 Coordinates: ${coordinates.lat}, ${coordinates.lng}`);

  try {
    // Fetch BigDataCloud data
    console.log(`\n⏳ Fetching BigDataCloud data...`);
    const data = await container.bigDataCloudClient.reverseGeocode(
      coordinates.lat,
      coordinates.lng
    );

    console.log(`\n✅ BigDataCloud Response:`);
    console.log(`   Country: ${data.countryCode} - ${data.countryName}`);
    console.log(`   City: ${data.city}`);
    console.log(`   Locality: ${data.locality}`);

    // Check administrative levels
    console.log(`\n📋 Administrative Levels (administrative array):`);
    const administrative = data.localityInfo?.administrative || [];
    if (administrative.length > 0) {
      administrative.forEach((level, index) => {
        console.log(`   [${index}] Level ${level.adminLevel || 'N/A'}: ${level.name}`);
        if (level.description) console.log(`       Description: ${level.description}`);
      });
    } else {
      console.log(`   (empty)`);
    }

    // Check informative levels
    console.log(`\n📋 Informative Levels (informative array):`);
    const informative = data.localityInfo?.informative || [];
    if (informative.length > 0) {
      informative.forEach((level, index) => {
        console.log(`   [${index}] ${level.name}`);
        if (level.description) console.log(`       Description: ${level.description}`);
      });
    } else {
      console.log(`   (empty)`);
    }

    // Test district extraction
    console.log(`\n🔬 Testing District Extraction:`);
    const district = container.districtExtractionService.extractDistrict(
      data.countryCode,
      administrative,
      informative
    );

    console.log(`\n📊 Extraction Result:`);
    console.log(`   District: ${district || 'null'}`);

    // Show what locationKey would be built
    const locationParts = [
      data.countryName?.toLowerCase().replace(/\s+/g, '-'),
      data.city?.toLowerCase().replace(/\s+/g, '-'),
      district?.toLowerCase().replace(/\s+/g, '-'),
    ].filter(Boolean);

    const locationKey = locationParts.join('|');
    console.log(`   LocationKey: ${locationKey}`);

    // Analysis
    console.log(`\n💡 Analysis:`);
    if (district === 'Rio de Janeiro') {
      console.log(`   ⚠️  District is the city name (Rio de Janeiro)`);
      console.log(`   This happens when:`);
      console.log(`   1. No tourism zone found in informative array`);
      console.log(`   2. adminLevel 8 contains "Rio de Janeiro" (city) instead of bairro`);
      console.log(`\n   Possible solutions:`);
      console.log(`   - Check if Grajaú appears at a different adminLevel`);
      console.log(`   - Check if there's zone info we're missing`);
      console.log(`   - Consider using locality field as fallback`);
    }

    // Check if locality has useful info
    if (data.locality && data.locality !== data.city) {
      console.log(`\n   💡 Note: locality field has "${data.locality}" (different from city)`);
      console.log(`   This might contain the bairro information!`);
    }

    console.log('\n' + '='.repeat(80));

    // Full response for debugging
    console.log(`\n📄 Full BigDataCloud Response (JSON):`);
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error(`\n❌ Error:`, error);
  }
}

debugBrazilAddress();
