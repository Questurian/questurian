import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePasswordRequirements } from './auth-utils.ts'

// The checklist must say what the server enforces: uppercase in any alphabet.
test('uppercase counts in any alphabet, as on the server', () => {
  assert.equal(validatePasswordRequirements('Ünïcødé-🔑-2026!').hasUppercase, true)
  assert.equal(validatePasswordRequirements('Ωmega-pass-1!').hasUppercase, true)
  assert.equal(validatePasswordRequirements('ünïcødé-🔑-2026!').hasUppercase, false)
})
