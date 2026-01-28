#!/usr/bin/env node

/**
 * Display available npm scripts and system info on server startup
 */

const { execSync } = require('child_process')
const os = require('os')

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
console.log('    pnpm clear:test       Clear test collections (preserves users)')
console.log('    pnpm test             Run integration tests')
console.log('')
console.log('  Code Generation:')
console.log('    pnpm generate:types   Generate TypeScript types from collections')
console.log('    pnpm generate:importmap')
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
