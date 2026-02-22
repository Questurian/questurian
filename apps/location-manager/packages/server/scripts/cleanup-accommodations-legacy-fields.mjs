#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const COLLECTION = 'accommodations';
const FIELDS_TO_CLEAR = [
  'operationHours',
  'neighborhoodDescription',
  'tripadvisorUrl',
  'district',
  'sourceAddress',
  'placeId',
  'contactAddress',
  'locationKey',
  'tripadvisorLocationId',
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function ensureEnv() {
  const cwdEnv = path.resolve(process.cwd(), '.env');
  const rootEnv = path.resolve(process.cwd(), '../../.env');
  loadEnvFile(cwdEnv);
  loadEnvFile(rootEnv);

  const apiUrl = process.env.PAYLOAD_API_URL;
  const email = process.env.PAYLOAD_SERVICE_EMAIL;
  const password = process.env.PAYLOAD_SERVICE_PASSWORD;

  if (!apiUrl || !email || !password) {
    throw new Error('Missing PAYLOAD_API_URL / PAYLOAD_SERVICE_EMAIL / PAYLOAD_SERVICE_PASSWORD in environment.');
  }

  return { apiUrl, email, password };
}

async function authenticate(apiUrl, email, password) {
  const body = JSON.stringify({ email, password });
  const headers = { 'Content-Type': 'application/json' };

  const primary = await fetch(`${apiUrl}/api/users/login`, { method: 'POST', headers, body });
  if (primary.ok) {
    const data = await primary.json();
    if (data?.token) return data.token;
  }

  const fallback = await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers, body });
  if (!fallback.ok) {
    const primaryText = await primary.text().catch(() => '');
    const fallbackText = await fallback.text().catch(() => '');
    throw new Error(
      `Auth failed. users/login=${primary.status} ${primaryText} | auth/login=${fallback.status} ${fallbackText}`
    );
  }

  const data = await fallback.json();
  if (!data?.token) {
    throw new Error('Auth succeeded but no token returned.');
  }
  return data.token;
}

async function fetchAllDocs(apiUrl, token) {
  const docs = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await fetch(`${apiUrl}/api/${COLLECTION}?limit=100&page=${page}`, {
      headers: { Authorization: `JWT ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch ${COLLECTION} page ${page}: ${res.status} ${text}`);
    }

    const data = await res.json();
    docs.push(...(data.docs || []));
    totalPages = Number(data.totalPages || 1);
    page += 1;
  } while (page <= totalPages);

  return docs;
}

function buildPatch(doc) {
  const patch = {};
  for (const field of FIELDS_TO_CLEAR) {
    if (field in doc && doc[field] !== null) {
      patch[field] = null;
    }
  }
  return patch;
}

async function patchDoc(apiUrl, token, id, patch) {
  const res = await fetch(`${apiUrl}/api/${COLLECTION}/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `JWT ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${id} failed: ${res.status} ${text}`);
  }
}

async function run() {
  const { apiUrl, email, password } = ensureEnv();
  console.log(`🔐 Authenticating to ${apiUrl}...`);
  const token = await authenticate(apiUrl, email, password);

  console.log('📥 Fetching accommodations docs...');
  const docs = await fetchAllDocs(apiUrl, token);
  console.log(`Found ${docs.length} accommodations docs.`);

  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    const patch = buildPatch(doc);
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      await patchDoc(apiUrl, token, doc.id, patch);
      changed += 1;
      console.log(`✅ ${doc.title || doc.id}: cleared [${keys.join(', ')}]`);
    } catch (error) {
      failed += 1;
      console.error(`❌ ${doc.title || doc.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\nCleanup complete:');
  console.log(`- Updated: ${changed}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Failed:  ${failed}`);
  console.log(`- Collection: ${COLLECTION}`);
  console.log(`- Fields cleared: ${FIELDS_TO_CLEAR.join(', ')}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('❌ Cleanup script failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
