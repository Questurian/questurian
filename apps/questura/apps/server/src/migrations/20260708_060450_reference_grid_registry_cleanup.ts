import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  void db
  void payload
  void req
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  void db
  void payload
  void req
}
