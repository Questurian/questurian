#!/usr/bin/env bun

import { getDb, initDb } from '../../../shared/db/client';

/**
 * One-time script: Auto-approve any taxonomy entries referenced by existing locations
 *
 * This script ensures that all locationKeys currently in use by locations
 * have their corresponding taxonomy entries marked as 'approved'.
 */
function approveExistingTaxonomy(): void {
  console.log("🔍 Finding taxonomy entries in use by locations...");

  initDb();
  const db = getDb();

  // Get all distinct locationKeys from locations table
  const locationKeys = db.query(`
    SELECT DISTINCT locationKey
    FROM locations
    WHERE locationKey IS NOT NULL
  `).all() as Array<{ locationKey: string }>;

  console.log(`📍 Found ${locationKeys.length} unique locationKeys in use`);

  // For each locationKey, ensure taxonomy entry exists and is approved
  const updateStmt = db.query(`
    UPDATE location_taxonomy
    SET status = 'approved'
    WHERE locationKey = $locationKey AND status = 'pending'
  `);

  let updatedCount = 0;

  locationKeys.forEach(({ locationKey }) => {
    const result = updateStmt.run({ $locationKey: locationKey });
    if (result.changes > 0) {
      console.log(`  ✅ Approved: ${locationKey}`);
      updatedCount++;
    }
  });

  console.log(`\n✅ Auto-approved ${updatedCount} taxonomy entries`);
}

// Run the script
if (import.meta.main) {
  try {
    approveExistingTaxonomy();
    console.log('\n🎉 Migration complete!');
  } catch (error) {
    console.error('💥 Error:', error);
    process.exit(1);
  }
}
