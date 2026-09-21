import { afterEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({ maxConnections: 0, processCount: 1 }))

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    database: {
      get maxConnections() {
        return config.maxConnections
      },
      get processCount() {
        return config.processCount
      },
    },
  },
}))

const { describePoolBudget, poolBudget } = await import('./pool-budget')

afterEach(() => {
  config.maxConnections = 0
  config.processCount = 1
})

describe('poolBudget', () => {
  it('adds up every pool one process can open', () => {
    // 20 payload + 10 visitor auth + 10 advisory locks + 1 startup.
    expect(poolBudget().perProcess).toBe(41)
  })

  // The numbers were sized sensibly in three separate files. Nothing
  // multiplied them by the number of processes, and Postgres does not care
  // which pool exhausts it.
  it('multiplies by the number of processes', () => {
    config.processCount = 3
    expect(poolBudget().total).toBe(123)
  })

  it('flags a budget that cannot fit', () => {
    config.processCount = 3
    config.maxConnections = 100
    expect(poolBudget().exceedsAllowance).toBe(true)
  })

  it('fits when the allowance is large enough', () => {
    config.processCount = 2
    config.maxConnections = 200
    expect(poolBudget().exceedsAllowance).toBe(false)
  })

  it('claims nothing when no allowance was declared', () => {
    config.processCount = 10
    config.maxConnections = 0
    expect(poolBudget().exceedsAllowance).toBe(false)
    expect(describePoolBudget()).toContain('allowance not declared')
  })
})

describe('describePoolBudget', () => {
  it('names the pools so the number can be argued with', () => {
    config.processCount = 3
    config.maxConnections = 100

    const description = describePoolBudget()
    expect(description).toContain('123 connections')
    expect(description).toContain('20 payload')
    expect(description).toContain('10 advisory locks')
    expect(description).toContain('against 100 allowed')
  })
})
