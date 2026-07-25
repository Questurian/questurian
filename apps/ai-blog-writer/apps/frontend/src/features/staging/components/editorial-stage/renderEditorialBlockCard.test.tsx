/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EditorialBlock } from '../../types'
import {
  buildCanonicalFAQMarkdown,
  buildCanonicalKeyTakeawaysMarkdown,
} from '../../features/editorial-stage-article/editorial-markdown.service'
import { renderEditorialBlockCard } from './renderEditorialBlockCard'

function buildBlock(overrides?: Partial<EditorialBlock>): EditorialBlock {
  return {
    id: 'editorial-1',
    component: 'key_takeaways_box',
    label: 'Key Takeaways',
    markdown: buildCanonicalKeyTakeawaysMarkdown('Key Takeaways', [
      'Book ahead.',
      'Visit early.',
    ]),
    ...overrides,
  }
}

describe('renderEditorialBlockCard', () => {
  it('renders a structured block preview', () => {
    render(renderEditorialBlockCard(buildBlock(), 2))

    expect(screen.getByTitle('Block order')).toHaveTextContent('2')
    expect(screen.getByRole('heading', { name: 'Key Takeaways' })).toBeInTheDocument()
    expect(screen.getByText('Book ahead.')).toBeInTheDocument()
    expect(screen.getByText('Visit early.')).toBeInTheDocument()
  })

  it('keeps structured edits in canonical markdown', () => {
    const onChangeMarkdown = vi.fn()
    render(renderEditorialBlockCard(buildBlock({
      component: 'faq_block',
      label: 'FAQ',
      markdown: buildCanonicalFAQMarkdown('FAQ', [
        { question: 'When?', answer: 'Early.' },
        { question: 'Where?', answer: 'Downtown.' },
      ]),
    }), 1, {
      canEdit: true,
      onChangeMarkdown,
    }))

    fireEvent.change(screen.getByDisplayValue('When?'), {
      target: { value: 'What time?' },
    })

    expect(onChangeMarkdown).toHaveBeenCalledOnce()
    expect(onChangeMarkdown.mock.calls[0][0]).toContain('> **Q:** What time?')
    expect(onChangeMarkdown.mock.calls[0][0]).toContain('> A: Early.')
  })

  it('preserves the raw markdown fallback for unsupported components', () => {
    const onChangeMarkdown = vi.fn()
    render(renderEditorialBlockCard(buildBlock({
      component: 'custom_box',
      label: 'Custom',
      markdown: 'Original markdown',
    }), 1, {
      canEdit: true,
      onChangeMarkdown,
    }))

    fireEvent.change(screen.getByDisplayValue('Original markdown'), {
      target: { value: 'Updated markdown' },
    })

    expect(onChangeMarkdown).toHaveBeenCalledWith('Updated markdown')
    expect(screen.getByText('Unsupported block type. Edit markdown directly.')).toBeInTheDocument()
  })
})
