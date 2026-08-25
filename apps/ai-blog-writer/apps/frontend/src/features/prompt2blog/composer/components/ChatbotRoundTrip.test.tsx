import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatbotRoundTrip } from './ChatbotRoundTrip'

describe('ChatbotRoundTrip', () => {
  it('teaches the copy-out and paste-in sequence in order', () => {
    render(<ChatbotRoundTrip />)

    const steps = within(screen.getByRole('list', { name: 'Chatbot round trip' }))
      .getAllByRole('listitem')
      .map(item => item.textContent)

    expect(steps).toEqual([
      '1Copy prompt',
      '2Paste into your chatbot',
      '3Paste the answer here',
    ])
  })
})
