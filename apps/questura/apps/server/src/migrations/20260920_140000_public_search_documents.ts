import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `public_search_documents` — one searchable row per published document.
 *
 * Search used to assemble its own corpus on every query: aggregate body text
 * out of a dozen block tables per collection, concatenate it with title and
 * SEO fields, build a weighted `tsvector` for every published document, and
 * only then rank and count. The work is proportional to the whole corpus, for
 * every visitor, including the ones who find nothing. A small scratch database
 * hides that completely.
 *
 * This table is that assembly, done once when a document is saved. The
 * `tsvector` is stored and GIN-indexed so ranking is an index lookup rather
 * than a corpus rebuild.
 *
 * Additive: a new table and its indexes. No existing column, constraint or row
 * is touched, and search falls back to the old query if the table is empty, so
 * applying this before the backfill runs degrades rather than breaks.
 *
 * `pg_trgm` is attempted for the substring match and is optional on purpose —
 * a managed Postgres may refuse `CREATE EXTENSION`. Without it the substring
 * match scans this table, which is still far cheaper than rebuilding the
 * corpus; with it, the scan becomes an index lookup too.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public_search_documents" (
      "type_key" text NOT NULL,
      "doc_id" integer NOT NULL,
      "language" text NOT NULL,
      "published_at" timestamptz,
      "title" text,
      "phrase_text" text NOT NULL,
      "document" tsvector NOT NULL,
      "indexed_at" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("type_key", "doc_id")
    );
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "public_search_documents_document_idx"
    ON "public_search_documents" USING GIN ("document");
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "public_search_documents_language_idx"
    ON "public_search_documents" ("language", "published_at" DESC);
  `)

  await db.execute(sql`
    DO $$
    BEGIN
      BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_trgm unavailable; substring search will scan public_search_documents';
        RETURN;
      END;

      CREATE INDEX IF NOT EXISTS "public_search_documents_phrase_trgm_idx"
      ON "public_search_documents" USING GIN ("phrase_text" gin_trgm_ops);
    END
    $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "public_search_documents_phrase_trgm_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "public_search_documents_language_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "public_search_documents_document_idx";`)
  await db.execute(sql`DROP TABLE IF EXISTS "public_search_documents";`)
}
