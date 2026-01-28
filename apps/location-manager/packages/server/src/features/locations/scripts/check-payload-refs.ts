import { getDb } from "@server/shared/db/client";

const db = getDb();

const query = db.query(`
  SELECT
    id,
    name,
    payload_location_ref,
    typeof(payload_location_ref) as type,
    length(payload_location_ref) as length,
    CASE
      WHEN payload_location_ref IS NULL THEN 'NULL'
      WHEN payload_location_ref = '' THEN 'EMPTY STRING'
      ELSE 'HAS VALUE'
    END as status
  FROM locations
  ORDER BY id DESC
  LIMIT 20
`);

const results = query.all();

console.table(results);
console.log('\n📊 Summary:');
console.log('Total locations checked:', results.length);
console.log('With values:', results.filter((r: any) => r.status === 'HAS VALUE').length);
console.log('NULL:', results.filter((r: any) => r.status === 'NULL').length);
console.log('Empty string:', results.filter((r: any) => r.status === 'EMPTY STRING').length);
