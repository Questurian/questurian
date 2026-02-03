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
console.log('Questurian Leads - API Server')
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
console.log('    API:                http://localhost:4004')
console.log('    Health Check:       http://localhost:4004/health')
console.log('    Swagger Docs:       http://localhost:4004/docs')
console.log('    ReDoc:              http://localhost:4004/redoc')
console.log('')
console.log('='.repeat(60))
console.log('Available Commands:')
console.log('='.repeat(60))
console.log('')
console.log('  Development:')
console.log('    pnpm run dev          Start uvicorn server (port 4004)')
console.log('    pnpm run dev:clean    Kill port + pip install + start')
console.log('')
console.log('  Docker (LibreTranslate):')
console.log('    pnpm run docker:start Start LibreTranslate on port 5001')
console.log('    pnpm run docker:stop  Stop LibreTranslate container')
console.log('    pnpm run docker:logs  View LibreTranslate logs')
console.log('')
console.log('  From Repo Root:')
console.log('    pnpm run dev          Start API + client together')
console.log('')
console.log('  Env Flags:')
console.log('    RUN_MIGRATIONS=1      Run database migrations on start')
console.log('')
console.log('='.repeat(60))
console.log('')
