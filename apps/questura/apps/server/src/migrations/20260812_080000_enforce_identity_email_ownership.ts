import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * One normalized email may belong to Staff or Visitor identity, never both.
 *
 * Application guards provide useful errors but cannot make two independent
 * tables atomic under concurrent creation. This registry is the shared unique
 * key. AFTER triggers register every committed Staff/Visitor insert and email
 * change in the same transaction, so a conflicting write rolls back at the DB
 * boundary. Deletes release ownership for deliberate account replacement or
 * erasure.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
    CREATE TABLE "identity_email_owners" (
      "normalized_email" text PRIMARY KEY,
      "owner_kind" text NOT NULL,
      "owner_id" text NOT NULL,
      CONSTRAINT "identity_email_owners_kind_check"
        CHECK ("owner_kind" IN ('staff', 'visitor')),
      CONSTRAINT "identity_email_owners_owner_key"
        UNIQUE ("owner_kind", "owner_id"),
      CONSTRAINT "identity_email_owners_normalized_check"
        CHECK ("normalized_email" = LOWER(BTRIM("normalized_email"))),
      CONSTRAINT "identity_email_owners_visitor_staff_domain_check"
        CHECK (
          "owner_kind" <> 'visitor'
          OR "normalized_email" NOT LIKE '%@questurian.com'
      )
    );

    -- Payload runs each migration in one transaction. Hold this lock through
    -- backfill and trigger installation so no identity write can land between
    -- its source-table snapshot and registry enforcement.
    LOCK TABLE "users", "visitor_auth_users" IN SHARE ROW EXCLUSIVE MODE;

    INSERT INTO "identity_email_owners" ("normalized_email", "owner_kind", "owner_id")
    SELECT LOWER(BTRIM("email")), 'staff', "id"::text
    FROM "users";

    INSERT INTO "identity_email_owners" ("normalized_email", "owner_kind", "owner_id")
    SELECT LOWER(BTRIM("email")), 'visitor', "id"::text
    FROM "visitor_auth_users";

    CREATE OR REPLACE FUNCTION "sync_identity_email_owner"()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      identity_kind text := TG_ARGV[0];
      next_email text;
      previous_email text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        DELETE FROM "identity_email_owners"
        WHERE "owner_kind" = identity_kind
          AND "owner_id" = OLD."id"::text;
        RETURN OLD;
      END IF;

      next_email := LOWER(BTRIM(NEW."email"));

      IF TG_OP = 'UPDATE' THEN
        previous_email := LOWER(BTRIM(OLD."email"));
        IF next_email = previous_email THEN
          RETURN NEW;
        END IF;

        DELETE FROM "identity_email_owners"
        WHERE "owner_kind" = identity_kind
          AND "owner_id" = OLD."id"::text;
      END IF;

      INSERT INTO "identity_email_owners" ("normalized_email", "owner_kind", "owner_id")
      VALUES (next_email, identity_kind, NEW."id"::text);

      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER "users_identity_email_owner"
      AFTER INSERT OR UPDATE OF "email" OR DELETE ON "users"
      FOR EACH ROW
      EXECUTE FUNCTION "sync_identity_email_owner"('staff');

    CREATE TRIGGER "visitor_auth_users_identity_email_owner"
      AFTER INSERT OR UPDATE OF "email" OR DELETE ON "visitor_auth_users"
      FOR EACH ROW
      EXECUTE FUNCTION "sync_identity_email_owner"('visitor');
  `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
    DROP TRIGGER IF EXISTS "users_identity_email_owner" ON "users";
    DROP TRIGGER IF EXISTS "visitor_auth_users_identity_email_owner" ON "visitor_auth_users";
    DROP FUNCTION IF EXISTS "sync_identity_email_owner"();
    DROP TABLE IF EXISTS "identity_email_owners";
  `),
  )
}
