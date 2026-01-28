/**
 * Test script for Payload upsert functionality
 *
 * This script demonstrates the upsert logic:
 * 1. First call: Entry doesn't exist → CREATE
 * 2. Second call: Entry exists → UPDATE
 *
 * Run with: bun run packages/server/test-payload-upsert.ts
 */

import { PayloadApiClient } from "./src/shared/services/external/payload-api.client";
import { EnvConfig } from "./src/shared/config/env.config";
import type { PayloadEntryData } from "./src/shared/services/external/payload-api.client";

async function testUpsert() {
  console.log("🧪 Testing Payload upsert functionality\n");

  const config = new EnvConfig();
  const payloadClient = new PayloadApiClient(config);

  if (!payloadClient.isConfigured()) {
    console.error("❌ Payload CMS is not configured. Set PAYLOAD_API_URL, PAYLOAD_SERVICE_EMAIL, and PAYLOAD_SERVICE_PASSWORD in .env");
    process.exit(1);
  }

  // Test data
  const testTitle = `Test Upsert - ${Date.now()}`;
  const collection = "dining";

  const initialData: PayloadEntryData = {
    title: testTitle,
    type: "restaurant",
    gallery: [],
    status: "draft",
  };

  const updatedData: PayloadEntryData = {
    title: testTitle,
    type: "cafe", // Changed type
    gallery: [],
    address: "123 Test Street", // Added address
    status: "published", // Changed status
  };

  try {
    // Test 1: First upsert (should CREATE)
    console.log("📝 Test 1: First upsert (should CREATE)");
    console.log(`   Title: "${testTitle}"`);
    const firstResult = await payloadClient.upsertEntry(collection, initialData);
    console.log(`   ✅ Created entry with ID: ${firstResult.doc.id}`);
    console.log(`   - Type: ${firstResult.doc.type}`);
    console.log(`   - Status: ${firstResult.doc.status}\n`);

    // Test 2: Second upsert with same title (should UPDATE)
    console.log("📝 Test 2: Second upsert with same title (should UPDATE)");
    console.log(`   Title: "${testTitle}"`);
    const secondResult = await payloadClient.upsertEntry(collection, updatedData);
    console.log(`   ✅ Updated entry with ID: ${secondResult.doc.id}`);
    console.log(`   - Type: ${secondResult.doc.type} (changed from "restaurant" to "cafe")`);
    console.log(`   - Status: ${secondResult.doc.status} (changed from "draft" to "published")`);

    // Verify it's the same document
    if (firstResult.doc.id === secondResult.doc.id) {
      console.log(`   ✅ Same document ID - upsert worked correctly!\n`);
    } else {
      console.log(`   ❌ Different document IDs - upsert created duplicate!\n`);
      process.exit(1);
    }

    // Test 3: Verify using findEntryByTitle
    console.log("📝 Test 3: Verify entry exists using findEntryByTitle");
    const foundId = await payloadClient.findEntryByTitle(collection, testTitle);
    if (foundId === secondResult.doc.id) {
      console.log(`   ✅ Found entry with correct ID: ${foundId}\n`);
    } else {
      console.log(`   ❌ Entry not found or wrong ID\n`);
      process.exit(1);
    }

    console.log("✅ All upsert tests passed!");
    console.log(`\n💡 Note: Test entry "${testTitle}" was created in Payload. You may want to delete it manually.\n`);

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testUpsert();
