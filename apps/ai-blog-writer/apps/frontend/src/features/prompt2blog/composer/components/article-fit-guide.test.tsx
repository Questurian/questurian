/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArticleFitGuide } from './ArticleFitGuide'

afterEach(cleanup)

const openGuide = () =>
  fireEvent.click(screen.getByRole('button', { name: /What kind of article works here/i }))

describe('ArticleFitGuide', () => {
  it('stays out of the way until it is asked for', () => {
    render(<ArticleFitGuide />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('answers what the pipeline is good at, in one test the operator can apply', () => {
    render(<ArticleFitGuide />)
    openGuide()

    const dialog = screen.getByRole('dialog', { name: 'What kind of article works here' })
    expect(dialog).toHaveTextContent('Could two people look it up and get the same answer?')
    expect(dialog).toHaveTextContent('What a month in Lima costs')
    expect(dialog).toHaveTextContent('Is Lima worth it?')
  })

  it('says an opinion piece is still allowed, so the rule is not read as a ban', () => {
    render(<ArticleFitGuide />)
    openGuide()

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'The article can argue that Lima is worth it.',
    )
  })

  it('closes on Escape and hands focus back to the control that opened it', () => {
    render(<ArticleFitGuide />)
    openGuide()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /What kind of article works here/i })).toHaveFocus()
  })

  it('escapes a collapsed step, which hides its own body', () => {
    render(
      <div hidden>
        <ArticleFitGuide />
      </div>,
    )
    fireEvent.click(document.querySelector('.p2b-guide-trigger') as HTMLButtonElement)

    // A fixed overlay rendered inside a `hidden` subtree is invisible, and step
    // 1 collapses exactly that way.
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.closest('[hidden]')).toBeNull()
  })

  it('closes on the close button', () => {
    render(<ArticleFitGuide />)
    openGuide()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
