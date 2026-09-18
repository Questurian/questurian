import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { createEmptyItineraryStop } from '../actions/itinerary-item-creation.actions'
import { ItineraryMomentFields } from './ItineraryMomentFields'

function Harness() {
  const [item, setItem] = useState(createEmptyItineraryStop)
  return <ItineraryMomentFields item={item} onChange={setItem} />
}

describe('moment badge presets', () => {
  it.each(['Photo stop', 'Live music', 'Hands-on workshop', 'Picnic break'])('selects and reopens %s without selecting its parent badge too', async (label) => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Moment badge' }))
    await user.click(screen.getByRole('option', { name: label }))
    expect(screen.getByLabelText('Moment label')).toHaveValue(label)
    expect(screen.getByRole('button', { name: 'Moment badge' })).toHaveTextContent(label)
    await user.click(screen.getByRole('button', { name: 'Moment badge' }))
    const selected = within(screen.getByRole('listbox')).getAllByRole('option', { selected: true })
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveTextContent(label)
    expect(selected[0]).toHaveFocus()
  })
})
