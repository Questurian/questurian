#!/usr/bin/env node

/**
 * Display available project scripts and system info on server startup
 */

const { execSync } = require('child_process')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')

const dotenv = require('dotenv')

// Get git commit hash
let gitHash = 'unknown'
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch (e) {
  // Git not available or not a git repo
}

// Get git branch
let gitBranch = 'unknown'
try {
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
} catch (e) {
  // Git not available or not a git repo
}

// Environment info
const nodeVersion = process.version
const platform = os.platform()
const environment = process.env.NODE_ENV || 'development'
const timestamp = new Date().toLocaleString()

function loadEnvFiles() {
  const envFiles = [
    '.env',
    `.env.${environment}`,
    '.env.local',
    `.env.${environment}.local`,
  ]

  for (const envFile of envFiles) {
    const envPath = path.resolve(process.cwd(), envFile)

    if (fs.existsSync(envPath)) {
      dotenv.config({
        path: envPath,
        override: true,
      })
    }
  }
}

function summarizeDatabaseConfig(databaseUri) {
  if (!databaseUri) {
    return {
      status: 'missing',
    }
  }

  try {
    const parsed = new URL(databaseUri)

    return {
      status: 'ok',
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port || 5432),
      database: parsed.pathname.replace(/^\//, '') || '(default)',
      user: parsed.username ? decodeURIComponent(parsed.username) : '(default)',
    }
  } catch (error) {
    return {
      status: 'invalid',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function checkPortReachable(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })

    const finish = (status, error) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve({ status, error })
    }

    socket.setTimeout(1200)
    socket.once('connect', () => finish('reachable'))
    socket.once('timeout', () => finish('timeout', `Connection timed out to ${host}:${port}`))
    socket.once('error', (error) => finish('error', error.message))
  })
}

async function printStartupInfo() {
  loadEnvFiles()

  const databaseConfig = summarizeDatabaseConfig(process.env.DATABASE_URI)
  let databaseReachability = null

  if (databaseConfig.status === 'ok') {
    databaseReachability = await checkPortReachable(databaseConfig.host, databaseConfig.port)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('🚀 Questura Server')
  console.log('═'.repeat(60))
  console.log('')
  console.log('  Environment Info:')
  console.log(`    Environment:        ${environment}`)
  console.log(`    Node Version:       ${nodeVersion}`)
  console.log(`    Platform:           ${platform}`)
  console.log(`    Git Branch:         ${gitBranch}`)
  console.log(`    Git Commit:         ${gitHash}`)
  console.log(`    Started At:         ${timestamp}`)
  console.log('')
  console.log('  Database:')

  if (databaseConfig.status === 'missing') {
    console.log('    DATABASE_URI:       missing')
    console.log('    Startup note:       Payload requires DATABASE_URI to connect to Postgres')
  } else if (databaseConfig.status === 'invalid') {
    console.log('    DATABASE_URI:       invalid')
    console.log(`    Parse error:        ${databaseConfig.error}`)
  } else {
    console.log(`    Connection:         ${databaseConfig.user}@${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`)

    if (databaseReachability?.status === 'reachable') {
      console.log('    Reachability:       Postgres socket reachable')
    } else {
      const failureReason = databaseReachability?.error || 'Unknown connection failure'
      console.log('    Reachability:       Postgres not reachable')
      console.log(`    Failure:            ${failureReason}`)
      console.log('    Startup note:       Payload exits if Postgres is not listening on this host/port')
    }
  }

  console.log('')
  console.log('  Endpoints:')
  console.log('    Health Check:       http://localhost:4000/api/health')
  console.log('    Admin Panel:        http://localhost:4000/admin')
  console.log('    GraphQL:            http://localhost:4000/api/graphql')
  console.log('')
  console.log('═'.repeat(60))
  console.log('📋 Available Commands:')
  console.log('═'.repeat(60))
  console.log('')
  console.log('  Development:')
  console.log('    pnpm dev              Start dev server (port 4000)')
  console.log('    pnpm devsafe          Fresh start (clears .next cache)')
  console.log('')
  console.log('  Database & Testing:')
  console.log('    pnpm clear:payload:except-users')
  console.log('                      Preserves users and currencies')
  console.log('    pnpm clear:test       Clear test collections (preserves users)')
  console.log('    pnpm test             Run integration tests')
  console.log('')
  console.log('  Code Generation:')
  console.log('    pnpm generate:types   Generate TypeScript types from collections')
  console.log('    pnpm generate:importmap')
  console.log('')
  console.log('  Currency Data:')
  console.log('    pnpm bootstrap:currencies  Seed currencies and sync latest USD rates')
  console.log('    pnpm sync:exchange-rates   Refresh stored USD rates from ExchangeRate-API open')
  console.log('')
  console.log('  Production:')
  console.log('    pnpm build            Build for production')
  console.log('    pnpm start            Start production server')
  console.log('')
  console.log('  Utilities:')
  console.log('    pnpm lint             Run ESLint')
  console.log('    pnpm backfill:rankings')
  console.log('')
  console.log('═'.repeat(60))
  console.log('')
}

printStartupInfo().catch((error) => {
  console.error('Failed to print startup information:', error)
  process.exitCode = 1
})
