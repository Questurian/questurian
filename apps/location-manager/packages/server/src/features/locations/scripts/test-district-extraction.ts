import { ServiceContainer } from '../container/service-container';
import { initDb } from '@server/shared/db/client';

async function testDistrictExtraction() {
  console.log('\n🧪 Testing District Extraction Service with Real Coordinates\n');
  console.log('=' .repeat(80));

  // Initialize database (required for ServiceContainer)
  initDb();

  const container = ServiceContainer.getInstance();

  // Test coordinates for different countries
  const tests = [
    {
      name: 'Miraflores, Lima, Peru',
      lat: -12.1177544,
      lng: -77.0312137,
      expectedCountry: 'PE',
      expectedDistrict: 'Miraflores',
      expectedAdminLevel: 8
    },
    {
      name: 'Barranco, Lima, Peru',
      lat: -12.1529199,
      lng: -77.0225947,
      expectedCountry: 'PE',
      expectedDistrict: 'Barranco',
      expectedAdminLevel: 8
    },
    {
      name: 'Chapinero, Bogotá, Colombia',
      lat: 4.6362,
      lng: -74.0638,
      expectedCountry: 'CO',
      expectedDistrict: 'Chapinero',
      expectedAdminLevel: 6
    },
    {
      name: 'Santa Fe, Bogotá, Colombia',
      lat: 4.6022232,
      lng: -74.0717325,
      expectedCountry: 'CO',
      expectedDistrict: 'Santa Fe',
      expectedAdminLevel: 6
    },
    {
      name: 'Copacabana, Rio de Janeiro, Brazil',
      lat: -22.9711,
      lng: -43.1822,
      expectedCountry: 'BR',
      expectedDistrict: 'Rio de Janeiro', // Note: BigDataCloud may not have bairro-level granularity
      expectedAdminLevel: 8
    },
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const test of tests) {
    console.log(`\n📍 Testing: ${test.name}`);
    console.log(`   Coordinates: (${test.lat}, ${test.lng})`);
    console.log(`   Expected Country: ${test.expectedCountry}`);
    console.log(`   Expected District: ${test.expectedDistrict} (adminLevel ${test.expectedAdminLevel})`);

    try {
      // Fetch BigDataCloud data
      const data = await container.bigDataCloudClient.reverseGeocode(test.lat, test.lng);

      console.log(`\n   📥 API Response:`);
      console.log(`      Country: ${data.countryCode} - ${data.countryName}`);
      console.log(`      City: ${data.city}`);
      console.log(`      Locality: ${data.locality}`);

      // Extract district using service
      const district = container.districtExtractionService.extractDistrict(
        data.countryCode,
        data.localityInfo?.administrative || [],
        data.localityInfo?.informative
      );

      console.log(`\n   🔍 Available Admin Levels:`);
      const adminLevels = data.localityInfo?.administrative || [];
      adminLevels.forEach(admin => {
        const marker = admin.adminLevel === test.expectedAdminLevel ? '👉' : '  ';
        console.log(`      ${marker} Level ${admin.adminLevel}: ${admin.name}`);
      });

      console.log(`\n   📋 Informative Data (Brazil tourism zones):`);
      const informative = data.localityInfo?.informative || [];
      if (informative.length > 0) {
        informative.forEach(info => {
          console.log(`      - ${info.name}`);
        });
      } else {
        console.log(`      (none)`);
      }

      // Validate results
      const countryMatch = data.countryCode === test.expectedCountry;
      const districtMatch = district === test.expectedDistrict;

      console.log(`\n   📊 Results:`);
      console.log(`      Extracted District: ${district || 'null'}`);
      console.log(`      Country Match: ${countryMatch ? '✅' : '❌'} (${data.countryCode} === ${test.expectedCountry})`);
      console.log(`      District Match: ${districtMatch ? '✅' : '❌'} (${district} === ${test.expectedDistrict})`);

      if (countryMatch && districtMatch) {
        console.log(`\n   ✅ TEST PASSED`);
        passedTests++;
      } else {
        console.log(`\n   ❌ TEST FAILED`);
        failedTests++;
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
      failedTests++;
    }

    console.log('\n' + '-'.repeat(80));
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📈 Test Summary:`);
  console.log(`   Total Tests: ${tests.length}`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   Success Rate: ${((passedTests / tests.length) * 100).toFixed(1)}%`);
  console.log(`${'='.repeat(80)}\n`);

  // Display country mappings
  console.log(`\n📋 Current Country Mappings:`);
  const mappings = container.districtExtractionService.getAllMappings();
  Object.entries(mappings).forEach(([code, levels]) => {
    console.log(`   ${code}: adminLevel ${levels.join(', ')}`);
  });
  console.log('');

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

testDistrictExtraction();
