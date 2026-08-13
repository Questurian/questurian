import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useHomepageFeaturedSlots } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedSelection } from './types'

const selection: HomepageFeaturedSelection = {
  items: [],
  invalidItems: [],
  isComplete: false,
  allowDrafts: true,
  totalSlots: 1,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useHomepageFeaturedSlots', () => {
  // Consumers put usedKeys in effect deps (CuratedHomepageBlockEditor reports it
  // to the page for cross-block exclusion). If its identity changes on renders
  // where slots did not change, that effect refires every render and the page
  // enters an infinite render loop (act() in tests never terminates).
  it('keeps usedKeys referentially stable across re-renders when slots are unchanged', () => {
    const { result, rerender } = renderHook(
      () =>
        useHomepageFeaturedSlots({
          canManage: true,
          selection,
          saveSelection: vi.fn(),
          fetchCandidates: vi.fn(),
          // Inline array on purpose: parents rebuild the query key each render.
          selectionQueryKey: ['block', 'block-1', 'test-token'],
        }),
      { wrapper: createWrapper() },
    )

    const initialUsedKeys = result.current.usedKeys
    rerender()

    expect(result.current.usedKeys).toBe(initialUsedKeys)
  })
})
