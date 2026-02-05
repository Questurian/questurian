#!/usr/bin/env bun

/**
 * Migration: Clear auto-populated contactAddress values
 *
 * Previously, batch items had their contactAddress auto-populated from
 * Google Places API's formatted_address, causing "Contact Address:" to
 * display on the home screen for most batch items. The contactAddress
 * field should only be used for genuinely different addresses (e.g., a
 * mailing address different from the location).
 *
 * This migration clears contactAddress where it differs from the source
 * address, as these were auto-populated by Google Places API.
 *
 * Usage: bun packages/server/src/shared/db/migrations/clear-auto-populated-contact-address.ts
 */

import { getDb } from '../client';

async function clearAutoPopulatedContactAddress() {
  console.log('🔧 Starting migration: Clear auto-populated contactAddress values...\n');

  const db = getDb();

  // Get stats before migration
  const beforeStats = db.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN contactAddress IS NOT NULL AND contactAddress != '' THEN 1 ELSE 0 END) as with_contact_address,
      SUM(CASE WHEN contactAddress IS NOT NULL AND contactAddress != '' AND contactAddress != address THEN 1 ELSE 0 END) as with_different_contact_address
    FROM locations
  `).get() as {
    total: number;
    with_contact_address: number;
    with_different_contact_address: number;
  };

  console.log('📊 Before migration:');
  console.log(`   Total locations: ${beforeStats.total}`);
  console.log(`   With contactAddress: ${beforeStats.with_contact_address}`);
  console.log(`   With contactAddress different from source address: ${beforeStats.with_different_contact_address}`);
  console.log('');

  if (beforeStats.with_different_contact_address === 0) {
    console.log('✅ No auto-populated contactAddress values found. Nothing to migrate.\n');
    return;
  }

  // Show sample of what will be cleared
  const samples = db.query(`
    SELECT id, name, address, contactAddress
    FROM locations
    WHERE contactAddress IS NOT NULL
      AND contactAddress != ''
      AND contactAddress != address
    LIMIT 5
  `).all() as Array<{
    id: number;
    name: string;
    address: string;
    contactAddress: string;
  }>;

  console.log('📝 Sample of contactAddress values that will be cleared:');
  for (const sample of samples) {
    console.log(`   #${sample.id}: ${sample.name}`);
    console.log(`      Source address: ${sample.address}`);
    console.log(`      Contact address: ${sample.contactAddress}`);
    console.log('');
  }

  // Clear contactAddress where it differs from source address
  // These are the auto-populated values from Google Places API
  const result = db.run(`
    UPDATE locations
    SET contactAddress = NULL
    WHERE contactAddress IS NOT NULL
      AND contactAddress != ''
      AND contactAddress != address
  `);

  console.log(`✅ Cleared contactAddress for ${result.changes} locations\n`);

  // Verify migration
  const afterStats = db.query(`
    SELECT
      SUM(CASE WHEN contactAddress IS NOT NULL AND contactAddress != '' THEN 1 ELSE 0 END) as with_contact_address
    FROM locations
  `).get() as { with_contact_address: number };

  console.log('📊 After migration:');
  console.log(`   Locations with contactAddress: ${afterStats.with_contact_address}`);
  console.log('');
  console.log('✨ Migration completed successfully!\n');
}

// Run migration
clearAutoPopulatedContactAddress().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
