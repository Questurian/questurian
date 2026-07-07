import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import HomepageBlockSlotCountSection from './HomepageBlockSlotCountSection'

describe('HomepageBlockSlotCountSection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grows the draft slot count without confirmation', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')

    render(
      <HomepageBlockSlotCountSection
        blockId="block-1"
        blockType="article-grid"
        currentSlotCount={4}
        savedSlotCount={4}
        slots={[{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]}
        onResize={onResize}
      />
    )

    await user.click(screen.getByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: 'Apply size' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onResize).toHaveBeenCalledWith(8)
  })

  it('asks before shrinking away filled end slots', async () => {
    const user = userEvent.setup()
    const onResize = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <HomepageBlockSlotCountSection
        blockId="block-1"
        blockType="article-grid"
        currentSlotCount={8}
        savedSlotCount={8}
        slots={[
          { id: 1 },
          { id: 2 },
          { id: 3 },
          { id: 4 },
          { id: 5 },
          { id: 6 },
          { id: 7 },
          { id: 8 }
        ]}
        onResize={onResize}
      />
    )

    await user.click(screen.getByRole('button', { name: '4' }))
    await user.click(screen.getByRole('button', { name: 'Apply size' }))

    expect(window.confirm).toHaveBeenCalledWith(
      'Shrink this block to 4 slots? 4 filled slots at the end will be removed from this draft.'
    )
    expect(onResize).not.toHaveBeenCalled()
  })
})
