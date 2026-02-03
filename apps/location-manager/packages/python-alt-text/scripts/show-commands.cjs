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
console.log('Python Alt-Text Service (BLIP)')
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
console.log('    API:                http://localhost:8642')
console.log('    Health Check:       http://localhost:8642/test')
console.log('')
console.log('  Note: First startup may be slow (loading BLIP model)')
console.log('')
console.log('='.repeat(60))
console.log('Available Commands:')
console.log('='.repeat(60))
console.log('')
console.log('  Development:')
console.log('    pnpm run dev          Start uvicorn server (port 8642)')
console.log('    pnpm run dev:clean    Kill port + pip install + start')
console.log('')
console.log('  Python Setup:')
console.log('    pnpm run py:install         Install deps to user site-packages')
console.log('    pnpm run py:install:system  Install deps system-wide (sudo)')
console.log('')
console.log('  Testing:')
console.log('    pnpm run test              Check Python version')
console.log('    pnpm run test:connection   Test server connection')
console.log('')
console.log('='.repeat(60))
console.log('')
