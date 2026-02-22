#!/usr/bin/env node

const { accessSync, constants } = require('fs')
const { spawnSync } = require('child_process')

const isExecutableFile = (filePath) => {
  try {
    accessSync(filePath, constants.X_OK)
  } catch {
    return false
  }

  const result = spawnSync(filePath, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

const isRunnableCommand = (command) => {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

const canUseInterpreter = (candidate) => {
  if (!candidate) return false
  if (candidate.includes('/')) return isExecutableFile(candidate)
  return isRunnableCommand(candidate)
}

const unique = (values) => [...new Set(values.filter(Boolean))]

const override = process.env.LM_PYTHON_BIN || process.env.PYTHON_BIN
if (override) {
  if (canUseInterpreter(override)) {
    process.stdout.write(override)
    process.exit(0)
  }

  console.error(
    `[lm-python-alt-text] LM_PYTHON_BIN/PYTHON_BIN is set but not runnable: ${override}`
  )
  process.exit(1)
}

const platformCandidates = {
  darwin: unique([
    '/opt/homebrew/bin/python3.12',
    '/usr/local/bin/python3.12',
    '/usr/bin/python3.12',
    'python3.12',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3',
    '/usr/bin/python3'
  ]),
  linux: unique([
    '/usr/bin/python3.12',
    '/usr/local/bin/python3.12',
    'python3.12',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    'python3'
  ])
}

const fallbackCandidates = unique([
  'python3.12',
  '/usr/bin/python3.12',
  '/usr/local/bin/python3.12',
  'python3',
  '/usr/bin/python3',
  '/usr/local/bin/python3'
])

const candidates = platformCandidates[process.platform] || fallbackCandidates
const interpreter = candidates.find(canUseInterpreter)

if (!interpreter) {
  console.error(
    `[lm-python-alt-text] No usable Python interpreter found for platform "${process.platform}". Tried: ${candidates.join(
      ', '
    )}`
  )
  process.exit(1)
}

process.stdout.write(interpreter)
