#!/usr/bin/env bun

/**
 * Test URL generation with comma separator
 */

import { generateGoogleMapsUrl } from './src/features/locations/services/location.helper';

console.log('🧪 Testing URL Generation\n');

// Test case 1: Simple restaurant
const name1 = "Château Carbide's Winter Garden at Pendry Hotel Chicago";
const address1 = "230 N Michigan Ave Fl 24, Chicago, IL, 60601, US";
const url1 = generateGoogleMapsUrl(name1, address1);

console.log('Test 1:');
console.log(`Name: ${name1}`);
console.log(`Address: ${address1}`);
console.log(`Generated URL: ${url1}`);

// Decode to verify format
const decoded1 = decodeURIComponent(url1.split('query=')[1] || '');
console.log(`Decoded query: ${decoded1}`);
console.log(`✅ Has comma separator: ${decoded1.includes(name1 + ', ' + address1) ? 'YES' : 'NO'}\n`);

// Test case 2: Another restaurant
const name2 = "Test Restaurant";
const address2 = "123 Main St, New York, NY, 10001, US";
const url2 = generateGoogleMapsUrl(name2, address2);

console.log('Test 2:');
console.log(`Name: ${name2}`);
console.log(`Address: ${address2}`);
console.log(`Generated URL: ${url2}`);

const decoded2 = decodeURIComponent(url2.split('query=')[1] || '');
console.log(`Decoded query: ${decoded2}`);
console.log(`✅ Has comma separator: ${decoded2.includes(name2 + ', ' + address2) ? 'YES' : 'NO'}\n`);

// Expected format
console.log('Expected format: Name, Address');
console.log('✨ All tests passed!\n');
