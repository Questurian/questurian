#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import dotenv from 'dotenv'
import pg from 'pg'
import ts from 'typescript'

const { Client } = pg

const RISK_RULES = [
  ['destructive SQL', /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b/i],
  ['data rewrite', (statement) => /\bUPDATE\b/i.test(statement.replace(/\bON\s+UPDATE\b/gi, ''))],
  [
    'column or table rewrite',
    /\bALTER\s+TABLE\b[\s\S]{0,300}\b(?:ALTER\s+COLUMN|DROP\s+COLUMN|RENAME\s+(?:COLUMN|TO))\b/i,
  ],
  ['type rewrite', /\bALTER\s+TYPE\b/i],
  ['visitor auth schema', /\b(?:visitor_auth_[a-z0-9_]*|better_auth_[a-z0-9_]*)\b/i],
]

export function parseRegisteredMigrationNames(indexSource) {
  const sourceFile = ts.createSourceFile(
    'migrations/index.ts',
    indexSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  if ((sourceFile.parseDiagnostics ?? []).length > 0) {
    throw new Error('migrations/index.ts cannot be parsed')
  }

  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === 'migrations')
  if (!declaration || !ts.isArrayLiteralExpression(declaration.initializer)) {
    throw new Error('migrations/index.ts has no static migrations array')
  }

  const names = declaration.initializer.elements.map((element, index) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(`Migration registration ${index + 1} is not a static object`)
    }
    const property = element.properties.find((candidate) =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === 'name') ||
        (ts.isStringLiteral(candidate.name) && candidate.name.text === 'name')),
    )
    if (!property || !ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
      throw new Error(`Migration registration ${index + 1} has no static name`)
    }
    return property.initializer.text
  })

  if (names.length === 0) throw new Error('No registered migrations found in migrations/index.ts')

  const duplicate = names.find((name, index) => names.indexOf(name) !== index)
  if (duplicate) throw new Error(`Migration is registered more than once: ${duplicate}`)

  return names
}

function parseMigration(migrationSource, migrationName) {
  const sourceFile = ts.createSourceFile(
    `${migrationName}.ts`,
    migrationSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const parseErrors = sourceFile.parseDiagnostics ?? []
  if (parseErrors.length > 0) {
    throw new Error(`${migrationName} cannot be parsed for migration safety`)
  }

  const up = sourceFile.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === 'up' &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  )
  if (!up?.body) throw new Error(`${migrationName} has no exported up() migration`)

  return { sourceFile, up }
}

function staticTemplateText(template) {
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text
  return undefined
}

function staticSqlText(argument) {
  if (ts.isTaggedTemplateExpression(argument) &&
      ts.isIdentifier(argument.tag) &&
      argument.tag.text === 'sql') {
    return staticTemplateText(argument.template)
  }

  if (ts.isCallExpression(argument) &&
      ts.isPropertyAccessExpression(argument.expression) &&
      ts.isIdentifier(argument.expression.expression) &&
      argument.expression.expression.text === 'sql' &&
      argument.expression.name.text === 'raw' &&
      argument.arguments.length === 1) {
    const raw = argument.arguments[0]
    if (ts.isStringLiteral(raw)) return raw.text
    return staticTemplateText(raw)
  }

  return undefined
}

export function inspectMigration(migrationSource, migrationName) {
  const { sourceFile, up } = parseMigration(migrationSource, migrationName)
  const sqlStatements = []
  const unknownExecutions = []
  const unknownCallLines = []

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const isDbExecute = ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'db' &&
        node.expression.name.text === 'execute'
      const isSqlRaw = ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'sql' &&
        node.expression.name.text === 'raw'

      if (isDbExecute) {
        const sqlText = node.arguments.length === 1 ? staticSqlText(node.arguments[0]) : undefined
        if (sqlText === undefined) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          unknownExecutions.push(position.line + 1)
        } else {
          sqlStatements.push(sqlText)
        }
      } else if (!isSqlRaw) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        unknownCallLines.push(position.line + 1)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(up.body)

  const risks = new Set()
  for (const statement of sqlStatements) {
    for (const [label, detector] of RISK_RULES) {
      const detected = typeof detector === 'function'
        ? detector(statement)
        : detector.test(statement)
      if (detected) risks.add(label)
    }
  }
  if (unknownExecutions.length > 0) risks.add('dynamic SQL cannot be inspected')
  if (unknownCallLines.length > 0) risks.add('dynamic migration logic cannot be inspected')

  return {
    risks: [...risks],
    unknownExecutionLines: unknownExecutions,
    unknownCallLines,
  }
}

export function assessMigration(migrationSource, migrationName) {
  return inspectMigration(migrationSource, migrationName).risks
}

export function buildMigrationPlan({ registeredNames, appliedNames, migrationSources }) {
  const applied = new Set(appliedNames)

  return registeredNames
    .filter((name) => !applied.has(name))
    .map((name) => {
      const source = migrationSources.get(name)
      if (source === undefined) throw new Error(`Registered migration file is missing: ${name}.ts`)
      return { name, ...inspectMigration(source, name) }
    })
}

function parseArguments(argv) {
  let requireClean = false

  for (const argument of argv) {
    if (argument === '--require-clean') {
      requireClean = true
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return { requireClean }
}

async function readAppliedMigrationNames(client) {
  const tableResult = await client.query(
    "select to_regclass('public.payload_migrations')::text as table_name",
  )
  if (!tableResult.rows[0]?.table_name) return []

  const result = await client.query('select name from payload_migrations order by id')
  return result.rows.map((row) => row.name)
}

async function loadPlan(serverRoot, client) {
  const migrationsRoot = path.join(serverRoot, 'src', 'migrations')
  const indexSource = await fs.readFile(path.join(migrationsRoot, 'index.ts'), 'utf8')
  const registeredNames = parseRegisteredMigrationNames(indexSource)
  const appliedNames = await readAppliedMigrationNames(client)
  const migrationSources = new Map()

  for (const name of registeredNames) {
    if (appliedNames.includes(name)) continue
    const source = await fs.readFile(path.join(migrationsRoot, `${name}.ts`), 'utf8')
    migrationSources.set(name, source)
  }

  return buildMigrationPlan({ registeredNames, appliedNames, migrationSources })
}

async function main() {
  const { requireClean } = parseArguments(process.argv.slice(2))
  const serverRoot = process.cwd()

  dotenv.config({ path: path.join(serverRoot, '.env') })
  if (!process.env.DATABASE_URI) throw new Error('DATABASE_URI is not configured')

  const client = new Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()

  let plan
  try {
    plan = await loadPlan(serverRoot, client)
  } finally {
    await client.end()
  }

  if (plan.length === 0) {
    console.log('No pending migrations.')
    return
  }

  console.log('Pending migrations:')
  for (const migration of plan) {
    const disposition = migration.risks.length === 0
      ? 'automatic-safe'
      : `blocked (${migration.risks.join(', ')})`
    console.log(`  ${migration.name}: ${disposition}`)
    if (migration.unknownExecutionLines.length > 0) {
      console.log(`    dynamic db.execute() lines: ${migration.unknownExecutionLines.join(', ')}`)
    }
    if (migration.unknownCallLines.length > 0) {
      console.log(`    dynamic call lines: ${migration.unknownCallLines.join(', ')}`)
    }
  }

  if (requireClean) throw new Error('Migrations remain pending after pnpm db:migrate')

  const blocked = plan.filter(({ risks }) => risks.length > 0)
  if (blocked.length > 0) {
    throw new Error(
      'Risky migration blocked. Follow the manual migration procedure, then rerun deployment.',
    )
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error) => {
    console.error(`Migration preflight failed: ${error.message}`)
    process.exitCode = 1
  })
}
