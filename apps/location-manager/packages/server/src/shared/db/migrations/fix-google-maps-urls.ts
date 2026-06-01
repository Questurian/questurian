#!/usr/bin/env bun

/**
 * Migration: Fix Google Maps URLs to use comma separator
 *
 * Changes URL format from:
 *   https://www.google.com/maps/search/?api=1&query=Name%20Address
 * To:
 *   https://www.google.com/maps/search/?api=1&query=Name%2C%20Address
 *
 * Usage: pnpm run packages/server/src/shared/db/migrations/fix-google-maps-urls.ts
 */

import { getDb } from '../client';
import { generateGoogleMapsUrl } from '../../../features/locations/services/geocoding/google/maps-url.utils';

async function fixGoogleMapsUrls() {
  console.log('🔧 Starting Google Maps URL migration...\n');

  const db = getDb();

  // Get all locations
  const getAllQuery = db.query('SELECT id, name, address, url FROM locations');
  const locations = getAllQuery.all() as Array<{
    id: number;
    name: string;
    address: string;
    url: string;
  }>;

  console.log(`📊 Found ${locations.length} locations in database\n`);

  let updatedCount = 0;
  let unchangedCount = 0;

  // Prepare update statement
  const updateQuery = db.query('UPDATE locations SET url = $url WHERE id = $id');

  for (const location of locations) {
    // Generate new URL with comma separator
    const newUrl = generateGoogleMapsUrl(location.name, location.address);

    // Check if URL needs updating
    if (location.url !== newUrl) {
      updateQuery.run({
        $id: location.id,
        $url: newUrl,
      });

      console.log(`✅ Updated location #${location.id}: ${location.name}`);
      console.log(`   Old: ${location.url}`);
      console.log(`   New: ${newUrl}\n`);
      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  console.log('\n📈 Migration Summary:');
  console.log(`   Total locations: ${locations.length}`);
  console.log(`   Updated: ${updatedCount}`);
  console.log(`   Unchanged: ${unchangedCount}`);
  console.log('\n✨ Migration completed successfully!\n');
}

// Run migration
fixGoogleMapsUrls().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
