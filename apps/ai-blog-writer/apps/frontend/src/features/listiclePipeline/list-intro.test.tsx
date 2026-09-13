import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ListIntroPanel } from './components/ListIntro'
import { useListIntro } from './useListIntro'
import { loadListIntro, saveListIntro } from './api'
import type { ListIntro } from './types'

vi.mock('./api', () => ({
  loadListIntro: vi.fn(),
  saveListIntro: vi.fn()
}))

const locked: ListIntro = {
  ready_to_write: false,
  blockers: [
    { code: 'short', message: '18 of 20 places are on the list.' },
    { code: 'blurbs', message: '16 places have no current blurb.' }
  ],
  prompt: '',
  version: 0,
  text: '',
  stale: false,
  complete: false
}
const ready: ListIntro = {
  ...locked,
  ready_to_write: true,
  blockers: [],
  prompt: 'You are writing the intro for a travel listicle.'
}

function Board() {
  const intro = useListIntro('run')
  return (
    <ListIntroPanel intro={intro.intro} error={intro.error} onSave={intro.save} />
  )
}

beforeEach(() => {
  vi.mocked(loadListIntro).mockReset()
  vi.mocked(saveListIntro).mockReset()
})

it('shows the intro locked, with the reasons, until every place is done', async () => {
  vi.mocked(loadListIntro).mockResolvedValue(locked)
  render(<Board />)
  expect(await screen.findByText('Intro locked')).toBeInTheDocument()
  expect(screen.getByText('18 of 20 places are on the list.')).toBeInTheDocument()
  expect(screen.getByText('16 places have no current blurb.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Write the intro' })).toBeDisabled()
})

it('unlocks at all done, copies the prompt and saves the intro pasted back', async () => {
  vi.mocked(loadListIntro).mockResolvedValue(ready)
  vi.mocked(saveListIntro).mockResolvedValue({
    ...ready,
    version: 1,
    text: 'Lima takes its wings seriously.',
    complete: true
  })
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<Board />)
  await userEvent.click(await screen.findByRole('button', { name: 'Write the intro' }))
  await userEvent.click(screen.getByRole('button', { name: 'Copy intro prompt' }))
  expect(writeText).toHaveBeenCalledWith(ready.prompt)
  await userEvent.type(screen.getByLabelText('Intro text'), 'Lima takes its wings seriously.')
  await userEvent.click(screen.getByRole('button', { name: 'Save intro' }))
  await waitFor(() =>
    expect(saveListIntro).toHaveBeenCalledWith('run', {
      version: 0,
      text: 'Lima takes its wings seriously.'
    })
  )
  expect(await screen.findByText('Intro written · list 100% ready')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Lima takes its wings seriously.')).toBeInTheDocument()
})

it('warns when the list changed after the intro was saved', async () => {
  vi.mocked(loadListIntro).mockResolvedValue({
    ...ready,
    version: 1,
    text: 'An older intro.',
    stale: true
  })
  render(<Board />)
  expect(
    await screen.findByText('Intro out of date: the list changed after it was saved')
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Edit intro' }))
  expect(screen.getByRole('button', { name: 'Confirm intro' })).toBeEnabled()
})
