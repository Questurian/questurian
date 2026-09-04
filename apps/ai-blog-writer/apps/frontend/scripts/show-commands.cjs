#!/usr/bin/env node

/**
 * Display available scripts and system info on client startup
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
console.log('AI Blog Writer - Frontend')
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
console.log('  URLs:')
console.log('    App:                http://localhost:3003')
console.log('    API Server:         http://localhost:4003')
console.log('')
console.log('='.repeat(60))
console.log('Available Commands:')
console.log('='.repeat(60))
console.log('')
console.log('  Development:')
console.log('    nx serve frontend     Start Vite dev server (port 3003)')
console.log('    pnpm run dev          Start frontend + backend via Nx')
console.log('')
console.log('  Build:')
console.log('    nx build frontend     Production build')
console.log('')
console.log('  Code Quality:')
console.log('    nx lint frontend      Run ESLint')
console.log('')
console.log('='.repeat(60))
console.log('')
