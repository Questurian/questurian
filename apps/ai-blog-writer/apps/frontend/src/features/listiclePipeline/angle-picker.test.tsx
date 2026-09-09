import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AnglePicker } from './components/AnglePicker'
import type { ListicleGrillOption } from './types'

/**
 * The angle menu.
 *
 * What comes back from it is the search order, so what it sends matters more
 * than what it shows. It used to send a paragraph, and everything downstream
 * had to work out from a sentence which menu entry the line had been and
 * whether the operator had changed it.
 */

function option(overrides: Partial<ListicleGrillOption> = {}): ListicleGrillOption {
  return {
    text: 'cevicherias open for decades',
    recommended: true,
    group: 'heritage',
    shape: 'institution',
    role: 'broad',
    ...overrides,
  }
}

describe('the angle menu', () => {
  it('sends the records, not just the sentences', async () => {
    const onSend = vi.fn()
    render(
      <AnglePicker
        options={[option(), option({ text: 'very cheap cevicherias', shape: 'cheap', group: 'price' })]}
        busy={false}
        onSend={onSend}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /use these/i }))

    const [answer, selections] = onSend.mock.calls[0]
    expect(answer).toBe('cevicherias open for decades\nvery cheap cevicherias')
    expect(selections).toEqual([
      expect.objectContaining({ shape_key: 'institution', role: 'broad', edited: false }),
      expect.objectContaining({ shape_key: 'cheap', role: 'broad', edited: false }),
    ])
  })

  it('marks a line the operator rewrote', async () => {
    const onSend = vi.fn()
    render(<AnglePicker options={[option()]} busy={false} onSend={onSend} />)

    await userEvent.type(screen.getByRole('textbox'), ' in Callao')
    await userEvent.click(screen.getByRole('button', { name: /use these/i }))

    const [answer, selections] = onSend.mock.calls[0]
    // Kept exactly as written. A narrowing the operator wrote on purpose is
    // theirs, and this screen does not repair it.
    expect(answer).toBe('cevicherias open for decades in Callao')
    expect(selections[0].edited).toBe(true)
  })

  it('marks an angle nobody offered as the operator’s own', async () => {
    const onSend = vi.fn()
    render(<AnglePicker options={[option()]} busy={false} onSend={onSend} />)

    await userEvent.click(screen.getByRole('button', { name: /add an angle/i }))
    const boxes = screen.getAllByRole('textbox')
    await userEvent.type(boxes[boxes.length - 1], 'cevicherias by the fishing landings')
    await userEvent.click(screen.getByRole('button', { name: /use these/i }))

    const [, selections] = onSend.mock.calls[0]
    expect(selections[1]).toEqual(
      expect.objectContaining({ custom: true, shape_key: '' }),
    )
  })

  it('explains an overlap rather than refusing it', async () => {
    render(
      <AnglePicker
        options={[
          option({ text: 'cevicherias open for decades', shape: 'institution' }),
          option({ text: 'family-run cevicherias', shape: 'family' }),
        ]}
        busy={false}
        onSend={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/often return the same places/)
    // Both stay ticked. The operator knows the city.
    expect(screen.getByRole('button', { name: /use these/i })).toBeEnabled()
    expect(screen.getByText('2 searches')).toBeInTheDocument()
  })

  it('does not assert a stale label on a line that was changed', async () => {
    render(
      <AnglePicker
        options={[option(), option({ text: 'family-run cevicherias', shape: 'family' })]}
        busy={false}
        onSend={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/heritage/)

    await userEvent.type(screen.getAllByRole('textbox')[0], ' near the sea')
    // The clash was between two `heritage` lines and one of them no longer
    // reliably means what the catalogue said it meant.
    expect(screen.getByRole('status')).toHaveTextContent(/has been edited/)
  })

  it('groups the alternatives so the menu reads as kinds of angle', () => {
    render(
      <AnglePicker
        options={[
          option(),
          option({ text: 'very cheap cevicherias', recommended: false, group: 'price', shape: 'cheap' }),
          option({ text: 'cevicherias by the fishing landings', recommended: false, group: '', shape: '' }),
        ]}
        busy={false}
        onSend={vi.fn()}
      />,
    )
    const headings = screen
      .getAllByText(/^price$|^Specific to this list$/)
      .filter(node => node.className.includes('lp-picker-theme-name'))
    expect(headings.map(node => node.textContent)).toEqual([
      'price',
      'Specific to this list',
    ])
  })
})
