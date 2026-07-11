import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

function slugifyAuthorName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slug" varchar;`))

  const result = await db.execute(sql.raw(
    `SELECT "id", "first_name", "last_name", "public_profile_display_name"
     FROM "users" WHERE "slug" IS NULL ORDER BY "id";`,
  ))

  const rows = result.rows as Array<{
    id: number
    first_name: string | null
    last_name: string | null
    public_profile_display_name: string | null
  }>

  const taken = new Set<string>()
  for (const row of rows) {
    const source =
      row.public_profile_display_name?.trim() ||
      [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(' ')
    if (!source) continue

    let base = slugifyAuthorName(source)
    if (!base) continue
    // Purely numeric slugs are reserved for legacy /authors/:id URLs
    if (/^\d+$/.test(base)) base = `author-${base}`

    let candidate = base
    for (let n = 2; taken.has(candidate); n += 1) {
      candidate = `${base}-${n}`
    }
    taken.add(candidate)

    await db.execute(sql`UPDATE "users" SET "slug" = ${candidate} WHERE "id" = ${row.id};`)
  }

  await db.execute(
    sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "users_slug_idx" ON "users" ("slug");`),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "users_slug_idx";`))
  await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "slug";`))
}
