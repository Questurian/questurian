import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ClaudeStatusPill from './ClaudeStatusPill'
import ClaudeConnectionPage from './pages/ClaudeConnectionPage'
import ClaudeTestBench from './components/ClaudeTestBench'
import { severityOf, needsSignIn } from './claude-connection.types'
import type {
  ClaudeConnectionStatus,
  ClaudeTestReply,
} from './claude-connection.types'
import {
  fetchClaudeModels,
  fetchClaudeStatus,
  sendClaudeTestMessage,
  startClaudeLogin,
} from './api/claude-connection.api'

vi.mock('./api/claude-connection.api', () => ({
  fetchClaudeStatus: vi.fn(),
  startClaudeLogin: vi.fn(),
  fetchClaudeModels: vi.fn(),
  sendClaudeTestMessage: vi.fn(),
}))

const fetchStatusMock = vi.mocked(fetchClaudeStatus)
const startLoginMock = vi.mocked(startClaudeLogin)
const fetchModelsMock = vi.mocked(fetchClaudeModels)
const sendMessageMock = vi.mocked(sendClaudeTestMessage)

function makeStatus(overrides: Partial<ClaudeConnectionStatus> = {}): ClaudeConnectionStatus {
  return {
    state: 'connected',
    connected: true,
    label: 'Claude Pro',
    detail: null,
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    subscriptionType: 'pro',
    email: 'owner@example.com',
    orgName: 'Owner Organization',
    usesSubscription: true,
    expiresInDays: null,
    overridingEnvVars: [],
    apiKeySource: null,
    cliPath: '/usr/local/bin/claude',
    cliVersion: '2.1.237 (Claude Code)',
    checkedAt: '2026-08-24T21:00:00+00:00',
    loginAvailable: true,
    loginCommand: '/usr/local/bin/claude auth login --claudeai',
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  fetchStatusMock.mockReset()
  startLoginMock.mockReset()
  fetchModelsMock.mockReset()
  sendMessageMock.mockReset()
  fetchModelsMock.mockResolvedValue([
    { id: 'haiku', label: 'Haiku', note: 'Fastest and cheapest.' },
    { id: 'opus', label: 'Opus', note: 'Most capable.' },
  ])
})

describe('severityOf', () => {
  it('treats an API-billed override as a warning, not an outage', () => {
    // It still answers requests. It just bills somewhere else, and colouring
    // it the same red as "unreachable" would train the eye to skip it.
    expect(severityOf(makeStatus({ state: 'api_billed_override', connected: false }))).toBe('warn')
    expect(severityOf(makeStatus({ state: 'console_account', connected: false }))).toBe('warn')
  })

  it('warns before a connected session lapses', () => {
    expect(severityOf(makeStatus({ expiresInDays: 3 }))).toBe('warn')
    expect(severityOf(makeStatus({ expiresInDays: 30 }))).toBe('ok')
    expect(severityOf(makeStatus())).toBe('ok')
  })

  it('treats an unreadable status as down', () => {
    expect(severityOf(null)).toBe('down')
    expect(severityOf(makeStatus({ state: 'cli_missing', connected: false }))).toBe('down')
  })

  it('knows which states a fresh sign-in fixes', () => {
    expect(needsSignIn('login_expired')).toBe(true)
    expect(needsSignIn('not_logged_in')).toBe(true)
    expect(needsSignIn('cli_missing')).toBe(false)
    expect(needsSignIn('api_billed_override')).toBe(false)
  })
})

describe('ClaudeStatusPill', () => {
  it('shows the plan and links to the connection page when connected', async () => {
    fetchStatusMock.mockResolvedValue(makeStatus())

    render(<ClaudeStatusPill />, { wrapper })

    const link = await screen.findByRole('link', { name: /Claude Pro/ })
    expect(link).toHaveAttribute('href', '/settings/claude')
    expect(link.className).toContain('connected')
  })

  it('reads red when the backend cannot be reached', async () => {
    fetchStatusMock.mockRejectedValue(new Error('Failed to fetch'))

    render(<ClaudeStatusPill />, { wrapper })

    const link = await screen.findByRole('link', { name: /Claude Unreachable/ })
    expect(link.className).toContain('disconnected')
  })

  it('reads amber when an API key outranks the subscription', async () => {
    fetchStatusMock.mockResolvedValue(
      makeStatus({
        state: 'api_billed_override',
        connected: false,
        label: 'Claude Billing Override',
        overridingEnvVars: ['ANTHROPIC_API_KEY'],
      }),
    )

    render(<ClaudeStatusPill />, { wrapper })

    const link = await screen.findByRole('link', { name: /Claude Billing Override/ })
    expect(link.className).toContain('degraded')
    expect(link.className).not.toContain('disconnected')
  })

  it('does not read the Payload connection', async () => {
    // The two lights are independent on purpose: Payload can be up while the
    // Claude login has lapsed, and the reverse.
    fetchStatusMock.mockResolvedValue(makeStatus())

    render(<ClaudeStatusPill />, { wrapper })

    await screen.findByRole('link', { name: /Claude Pro/ })
    expect(screen.queryByText(/Payload/)).not.toBeInTheDocument()
  })
})

describe('ClaudeConnectionPage', () => {
  it('names the variables that would move spend onto API billing', async () => {
    fetchStatusMock.mockResolvedValue(
      makeStatus({
        state: 'api_billed_override',
        connected: false,
        label: 'Claude Billing Override',
        detail: 'Signed in, but ANTHROPIC_API_KEY outranks the subscription login.',
        overridingEnvVars: ['ANTHROPIC_API_KEY'],
      }),
    )

    render(<ClaudeConnectionPage />, { wrapper })

    expect(await screen.findByText('ANTHROPIC_API_KEY')).toBeInTheDocument()
  })

  it('offers the sign-in button only when the backend says this browser may use it', async () => {
    fetchStatusMock.mockResolvedValue(
      makeStatus({
        state: 'login_expired',
        connected: false,
        label: 'Claude Login Expired',
        loginAvailable: false,
      }),
    )

    render(<ClaudeConnectionPage />, { wrapper })

    await screen.findByText('Claude Login Expired')
    expect(screen.queryByRole('button', { name: /Sign in to Claude/ })).not.toBeInTheDocument()
    // The fallback is always a copyable command, never a dead end.
    expect(screen.getByText('/usr/local/bin/claude auth login --claudeai')).toBeInTheDocument()
  })

  it('starts a sign-in and tells the user where to finish it', async () => {
    const user = userEvent.setup()
    fetchStatusMock.mockResolvedValue(
      makeStatus({
        state: 'login_expired',
        connected: false,
        label: 'Claude Login Expired',
        loginAvailable: true,
      }),
    )
    startLoginMock.mockResolvedValue({
      started: true,
      command: '/usr/local/bin/claude auth login --claudeai',
      detail: 'A terminal is opening.',
    })

    render(<ClaudeConnectionPage />, { wrapper })

    await user.click(await screen.findByRole('button', { name: /Sign in to Claude/ }))

    await waitFor(() => expect(startLoginMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/A terminal is opening on this machine/)).toBeInTheDocument()
  })

  it('surfaces a refused sign-in instead of failing silently', async () => {
    const user = userEvent.setup()
    fetchStatusMock.mockResolvedValue(
      makeStatus({ state: 'not_logged_in', connected: false, label: 'Claude Signed Out' }),
    )
    startLoginMock.mockRejectedValue(
      new Error('A Claude sign-in can only be started from a browser on the machine hosting this backend'),
    )

    render(<ClaudeConnectionPage />, { wrapper })

    await user.click(await screen.findByRole('button', { name: /Sign in to Claude/ }))

    expect(await screen.findByText(/only be started from a browser/)).toBeInTheDocument()
  })

  it('names an API key the CLI sees even when the backend environment is clean', async () => {
    fetchStatusMock.mockResolvedValue(
      makeStatus({
        state: 'api_billed_override',
        connected: false,
        label: 'Claude Billing Override',
        overridingEnvVars: [],
        apiKeySource: 'apiKeyHelper',
      }),
    )

    render(<ClaudeConnectionPage />, { wrapper })

    expect(await screen.findByText('apiKeyHelper')).toBeInTheDocument()
  })

  it('says an unreported expiry is unreported rather than leaving it blank', async () => {
    fetchStatusMock.mockResolvedValue(makeStatus({ expiresInDays: null }))

    render(<ClaudeConnectionPage />, { wrapper })

    expect(await screen.findByText('Not reported by the Claude CLI')).toBeInTheDocument()
  })
})

describe('ClaudeTestBench', () => {
  function makeReply(overrides: Partial<ClaudeTestReply> = {}): ClaudeTestReply {
    return {
      reply: 'BENCH_OK',
      isError: false,
      model: 'claude-haiku-4-5',
      sessionId: 'session-one',
      costUsd: 0.0161,
      durationMs: 2046,
      numTurns: 1,
      stopReason: 'end_turn',
      usage: {
        inputTokens: 10,
        outputTokens: 49,
        cacheReadInputTokens: 10704,
        cacheCreationInputTokens: 6929,
      },
      ...overrides,
    }
  }

  it('shows the reply with the model that actually answered, the time and the cost', async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(makeReply())

    render(<ClaudeTestBench blockedReason={null} />, { wrapper })

    await user.type(screen.getByLabelText('Message to send to Claude'), 'ping')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('BENCH_OK')).toBeInTheDocument()
    // The alias asked for was 'haiku'; the canonical name is what answered.
    expect(screen.getByText('claude-haiku-4-5')).toBeInTheDocument()
    expect(screen.getByText('2.0s')).toBeInTheDocument()
    expect(screen.getByText('1.61¢')).toBeInTheDocument()
  })

  it('carries the session forward so the conversation remembers itself', async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(makeReply())

    render(<ClaudeTestBench blockedReason={null} />, { wrapper })

    const box = screen.getByLabelText('Message to send to Claude')
    await user.type(box, 'first')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('BENCH_OK')

    await user.type(box, 'second')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(2))
    // First call opens a conversation; the second continues it.
    expect(sendMessageMock.mock.calls[0][0].sessionId).toBeUndefined()
    expect(sendMessageMock.mock.calls[1][0].sessionId).toBe('session-one')
  })

  it('drops the session when a new conversation is started', async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(makeReply())

    render(<ClaudeTestBench blockedReason={null} />, { wrapper })

    const box = screen.getByLabelText('Message to send to Claude')
    await user.type(box, 'first')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('BENCH_OK')

    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(screen.queryByText('BENCH_OK')).not.toBeInTheDocument()

    await user.type(box, 'fresh start')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(2))
    expect(sendMessageMock.mock.calls[1][0].sessionId).toBeUndefined()
  })

  it('attaches a failure to the turn that failed', async () => {
    const user = userEvent.setup()
    sendMessageMock.mockRejectedValue(new Error('Claude did not answer within 180s.'))

    render(<ClaudeTestBench blockedReason={null} />, { wrapper })

    await user.type(screen.getByLabelText('Message to send to Claude'), 'ping')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Claude did not answer within 180s.')).toBeInTheDocument()
  })

  it('refuses to send while the connection is not green', async () => {
    sendMessageMock.mockResolvedValue(makeReply())

    render(
      <ClaudeTestBench blockedReason="ANTHROPIC_API_KEY outranks the subscription login." />,
      { wrapper },
    )

    expect(screen.getByLabelText('Message to send to Claude')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(
      screen.getByText('ANTHROPIC_API_KEY outranks the subscription login.'),
    ).toBeInTheDocument()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('sends the model the user picked', async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(makeReply({ model: 'claude-opus-5' }))

    render(<ClaudeTestBench blockedReason={null} />, { wrapper })

    await waitFor(() => expect(screen.getByRole('option', { name: 'Opus' })).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox'), 'opus')
    await user.type(screen.getByLabelText('Message to send to Claude'), 'ping')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1))
    expect(sendMessageMock.mock.calls[0][0].model).toBe('opus')
  })
})
