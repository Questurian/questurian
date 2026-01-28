#!/usr/bin/env node

/**
 * Display available scripts and system info on server startup
 */

const { execSync } = require('child_process')
const os = require('os')

// Get git info
let gitHash = 'unknown'
let gitBranch = 'unknown'
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
} catch (e) {}

const nodeVersion = process.version
const platform = os.platform()
const environment = process.env.NODE_ENV || 'development'
const timestamp = new Date().toLocaleString()

console.log('\n' + '='.repeat(60))
console.log('Location Manager Server')
console.log('='.repeat(60))
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
console.log('    API:                http://localhost:4002')
console.log('    Health Check:       http://localhost:4002/health')
console.log('')
console.log('='.repeat(60))
console.log('Available Commands:')
console.log('='.repeat(60))
console.log('')
console.log('  Development:')
console.log('    bun run dev           Start server (port 4002)')
console.log('    bun run dev:clean     Kill port + install + start')
console.log('')
console.log('  Code Quality:')
console.log('    bun run lint          Run linter')
console.log('    bun run test          Run tests')
console.log('')
console.log('  From Monorepo Root:')
console.log('    turbo dev --filter=@questurian/lm-server')
console.log('')
console.log('='.repeat(60))
console.log('')
