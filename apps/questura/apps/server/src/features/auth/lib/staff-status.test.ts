import { describe, expect, it } from 'vitest'

import { isActiveStaff, isDisabledStaff } from './staff-status'

describe('Staff status', () => {
  it('treats only an explicit "disabled" as disabled', () => {
    expect(isDisabledStaff({ status: 'disabled' })).toBe(true)
    expect(isDisabledStaff({ status: 'active' })).toBe(false)
  })

  it('treats an absent status as active so disabling is always explicit', () => {
    expect(isDisabledStaff({})).toBe(false)
    expect(isDisabledStaff({ status: null })).toBe(false)
    expect(isActiveStaff({})).toBe(true)
  })

  it('does not consider an absent user active', () => {
    expect(isActiveStaff(null)).toBe(false)
    expect(isActiveStaff(undefined)).toBe(false)
    expect(isDisabledStaff(null)).toBe(false)
  })
})
