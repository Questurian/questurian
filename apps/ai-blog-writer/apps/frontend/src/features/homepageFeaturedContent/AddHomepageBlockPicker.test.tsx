import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AddHomepageBlockPicker from './AddHomepageBlockPicker'

describe('AddHomepageBlockPicker', () => {
  it('groups block types by operator intent', () => {
    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const options = screen.getAllByRole('button')

    expect(
      screen.getByRole('heading', { name: 'Lead stories' })
    ).toBeInTheDocument()
    const heroGroup = screen
      .getByRole('heading', { name: 'Hero features' })
      .closest('section')
    expect(heroGroup).not.toBeNull()
    expect(within(heroGroup!).getByText('Hero Article')).toBeInTheDocument()
    expect(within(heroGroup!).getByText('Creator Feature')).toBeInTheDocument()
    expect(
      within(heroGroup!).getByText('Featured Article Carousel')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Story collections' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Places & experiences' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Reader signup' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Page ending' })
    ).toBeInTheDocument()

    expect(options[0]).toHaveTextContent('Multi-Article Feature')
    expect(options[1]).toHaveTextContent('Editorial Feature')
    expect(options[2]).toHaveTextContent('Hero Article')
  })

  it('shows each choice as a described layout preview', () => {
    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        availableBlockTypes={['featured-articles', 'article-list']}
      />
    )

    expect(screen.getByText('Add a homepage section')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Lead stories' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Page ending' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Places & experiences' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('block-layout-preview-featured-articles')
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('block-layout-preview-article-list')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /Multi-Article Feature.*lead story/i
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Article List.*vertical feed/i })
    ).toBeInTheDocument()
    expect(
      screen.getAllByLabelText('Matching frontend client layout exists')
    ).toHaveLength(2)
  })

  it('keeps fixed-size blocks in the inline flow so section copy can be added', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Newsletter signup/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Fixed banner')).toBeInTheDocument()
    expect(screen.getByLabelText('Section heading')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Section heading'), 'Stay inspired')
    await user.click(
      screen.getByRole('button', { name: 'Add Newsletter signup' })
    )

    expect(onConfirm).toHaveBeenCalledWith(
      'newsletter-signup',
      0,
      'Stay inspired',
      undefined
    )
  })

  it.each([
    ['hotel-grid', 'Hotel Grid'],
    ['tour-grid', 'Tour Grid']
  ] as const)('adds growable %s blocks at four slots without a size step', async (blockType, label) => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        availableBlockTypes={[blockType]}
      />
    )

    await user.click(screen.getByRole('button', { name: new RegExp(label) }))

    expect(onConfirm).toHaveBeenCalledWith(blockType, 4)
    expect(screen.queryByRole('group', { name: `${label} size` })).not.toBeInTheDocument()
  })

  it('shows every Multi-Article Feature size as a visual layout choice', async () => {
    const user = userEvent.setup()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        availableBlockTypes={['featured-articles']}
      />
    )

    await user.click(
      screen.getByRole('button', { name: /Multi-Article Feature/i })
    )

    expect(
      screen.getByRole('group', { name: 'Multi-Article Feature size' })
    ).toBeInTheDocument()
    const counts = [3, 4, 5, 7, 8, 9]
    const previews = screen.getAllByTestId(
      'block-layout-preview-featured-articles'
    )
    expect(previews).toHaveLength(6)
    expect(
      screen.getAllByLabelText('Matching frontend client layout exists')
    ).toHaveLength(6)
    previews.forEach((preview, index) => {
      expect(preview.querySelectorAll('[data-featured-slot]')).toHaveLength(
        counts[index]
      )
    })
    expect(
      previews[0].querySelector('[data-featured-layout="hero-left"]')
    ).toBeInTheDocument()

    const layoutLabels = [
      'Hero + 2 stacked',
      'Hero + 3 side rows',
      'Hero + media + text rows',
      '2 left + hero + 4 compact',
      '2 left + hero + 5 compact',
      '2 left + hero pair + 5 compact'
    ]
    for (const [index, count] of counts.entries()) {
      expect(
        screen.getByRole('button', {
          name: `${count} items ${layoutLabels[index]} Matching frontend client layout exists`
        })
      ).toBeInTheDocument()
    }
  })

  it('shows real Editorial Feature rail treatments for every size', async () => {
    const user = userEvent.setup()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        availableBlockTypes={['editorial-feature']}
      />
    )

    await user.click(screen.getByRole('button', { name: /Editorial Feature/i }))

    expect(
      screen.getByRole('group', { name: 'Editorial Feature size' })
    ).toBeInTheDocument()

    const counts = [2, 3, 4, 6]
    const previews = screen.getAllByTestId(
      'block-layout-preview-editorial-feature'
    )
    expect(previews).toHaveLength(4)
    previews.forEach((preview, index) => {
      expect(preview.querySelectorAll('[data-editorial-related]')).toHaveLength(
        counts[index]
      )
      expect(preview.querySelector('[data-editorial-layout]')).toHaveAttribute(
        'data-editorial-layout',
        String(counts[index])
      )
    })
    expect(
      previews[0].querySelectorAll('[data-editorial-thumbnail]')
    ).toHaveLength(2)
    expect(
      previews[1].querySelectorAll('[data-editorial-thumbnail]')
    ).toHaveLength(3)
    expect(
      previews[2].querySelectorAll('[data-editorial-thumbnail]')
    ).toHaveLength(4)
    expect(
      previews[3].querySelectorAll('[data-editorial-thumbnail]')
    ).toHaveLength(0)
    expect(
      previews[3].querySelectorAll('[data-editorial-number]')
    ).toHaveLength(6)

    for (const label of [
      '2 items Portrait + copy + 2 large cards',
      '3 items Portrait + copy + 3 square cards',
      '4 items Portrait + copy + 4 wide cards',
      '6 items Portrait + copy + 6 numbered rows'
    ]) {
      expect(
        screen.getByRole('button', {
          name: `${label} Matching frontend client layout exists`
        })
      ).toBeInTheDocument()
    }
  })

  it('submits the new article-grid block with a valid slot count', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Article Grid/i }))

    expect(
      screen.getByRole('group', { name: 'Article Grid size' })
    ).toBeInTheDocument()
    const previews = screen.getAllByTestId('block-layout-preview-article-grid')
    expect(previews).toHaveLength(2)
    expect(previews[0]).toHaveAttribute('data-slot-count', '4')
    expect(previews[1]).toHaveAttribute('data-slot-count', '8')
    expect(
      screen.getByRole('button', {
        name: /4 items 4 across · wide images/
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /8 items 4 × 2 · square images/
      })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /8 items/i }))
    await user.click(screen.getByRole('button', { name: 'Add Article Grid' }))

    expect(onConfirm).toHaveBeenCalledWith(
      'article-grid',
      8,
      undefined,
      undefined
    )
  })

  it('can submit a location-grid block and respect filtered block types', async () => {
    const onConfirm = vi.fn()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        availableBlockTypes={['featured-articles', 'article-grid']}
      />
    )

    expect(
      screen.queryByRole('button', { name: /Location Grid/i })
    ).not.toBeInTheDocument()
  })

  it('submits the new location-grid block with a valid slot count', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <AddHomepageBlockPicker
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Location Grid/i }))

    expect(
      screen.getByRole('group', { name: 'Location Grid size' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /6 items/i }))
    await user.click(screen.getByRole('button', { name: 'Add Location Grid' }))

    expect(onConfirm).toHaveBeenCalledWith(
      'location-grid',
      6,
      undefined,
      undefined
    )
  })
})
