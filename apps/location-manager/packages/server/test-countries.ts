#!/usr/bin/env bun

import { getCountryNames } from "./src/features/locations/controllers/core";

// Mock Hono Context for testing
function mockContext() {
  return {
    req: {
      param: (key: string) => undefined,
    },
    json: (data: any) => {
      console.log("Response:", JSON.stringify(data, null, 2));
      return { status: 200, data };
    },
  };
}

async function testCountryNames() {
  console.log("🧪 Testing getCountryNames endpoint\n");

  try {
    const result = await getCountryNames(mockContext());
    console.log("\n✅ Test completed successfully!");
  } catch (error: any) {
    console.log(`❌ Test failed: ${error.message}`);
  }
}

testCountryNames();







