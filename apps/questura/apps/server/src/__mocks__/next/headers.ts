import { vi } from 'vitest'

const headers = vi.fn().mockResolvedValue(new Map())

export { headers }
