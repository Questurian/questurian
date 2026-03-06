import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})
