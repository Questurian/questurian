#!/usr/bin/env bun

/**
 * Debug script to check sync status and change detection
 */

import { getDb } from './src/shared/db/client.js';

const db = getDb();

console.log('=== Checking Locations with Recent Updates ===');
const recentLocations = db.query(`
  SELECT id, name, title, updated_at, created_at
  FROM locations
  WHERE updated_at > created_at
  ORDER BY updated_at DESC
  LIMIT 10
`).all();

console.log('Locations with updates:', recentLocations);

console.log('\n=== Checking Sync States ===');
const syncStates = db.query(`
  SELECT ls.id, ls.location_id, ls.last_synced_at, ls.sync_status,
         l.name, l.updated_at as location_updated_at
  FROM payload_sync_state ls
  LEFT JOIN locations l ON ls.location_id = l.id
  ORDER BY ls.last_synced_at DESC
  LIMIT 10
`).all();

console.log('Sync states:', syncStates);

console.log('\n=== Checking Recent Uploads ===');
const recentUploads = db.query(`
  SELECT u.id, u.location_id, u.created_at,
         l.name, l.updated_at as location_updated_at
  FROM uploads u
  LEFT JOIN locations l ON u.location_id = l.id
  ORDER BY u.created_at DESC
  LIMIT 5
`).all();

console.log('Recent uploads:', recentUploads);

// Test the change detection logic
console.log('\n=== Change Detection Test ===');
for (const syncState of syncStates.slice(0, 3)) {
  const location = db.query('SELECT * FROM locations WHERE id = ?', [syncState.location_id]).get();
  if (location && syncState.sync_status === 'success') {
    const lastModified = new Date(location.updated_at);
    const lastSynced = new Date(syncState.last_synced_at);
    const needsResync = lastModified > lastSynced;

    console.log(`Location ${location.name}:`);
    console.log(`  Last modified: ${location.updated_at}`);
    console.log(`  Last synced: ${syncState.last_synced_at}`);
    console.log(`  Needs resync: ${needsResync}`);
  }
}
