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
console.log('Questurian Leads - Client')
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
console.log('    App:                http://localhost:5173')
console.log('    API Server:         http://localhost:4004')
console.log('')
console.log('='.repeat(60))
console.log('Available Commands:')
console.log('='.repeat(60))
console.log('')
console.log('  Development:')
console.log('    bun run dev           Start Vite dev server (port 5173)')
console.log('    bun run dev:clean     Kill port + install + start')
console.log('')
console.log('  Build:')
console.log('    bun run build         Production build')
console.log('    bun run dev:preview   Preview production build')
console.log('')
console.log('  From Repo Root:')
console.log('    bun run dev           Start API + client together')
console.log('')
console.log('='.repeat(60))
console.log('')
