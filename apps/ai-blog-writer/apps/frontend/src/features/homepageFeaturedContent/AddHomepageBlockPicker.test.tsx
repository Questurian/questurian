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
  })

  it('submits newsletter-signup in one click (fixed zero slots)', async () => {
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

    expect(onConfirm).toHaveBeenCalledWith(
      'newsletter-signup',
      0,
      undefined,
      undefined
    )
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

    expect(screen.getByText(/choose 4 .* or 8/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: 'Add Block' }))

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
      screen.getByText(/choose between 4 and 8 items/i)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: 'Add Block' }))

    expect(onConfirm).toHaveBeenCalledWith(
      'location-grid',
      6,
      undefined,
      undefined
    )
  })
})
