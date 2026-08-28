import { apiFetch } from '../../../shared/api/client/apiFetch'
import { parseError } from '../../../shared/api/errors/parse-error'
import type {
  ClaudeConnectionStatus,
  ClaudeLoginStart,
  ClaudeModelChoice,
  Prompt2BlogCredentialInput,
  Prompt2BlogCredentialStatus,
  ClaudeTestReply,
  ClaudeTestRequest,
} from '../claude-connection.types'

export async function fetchPrompt2BlogCredentialStatus(): Promise<Prompt2BlogCredentialStatus> {
  const response = await apiFetch('/claude/prompt2blog-credential')
  if (!response.ok) {
    throw await parseError(response, 'Could not read Prompt2Blog article account')
  }
  return (await response.json()) as Prompt2BlogCredentialStatus
}

export async function savePrompt2BlogCredential(
  input: Prompt2BlogCredentialInput,
): Promise<Prompt2BlogCredentialStatus> {
  const response = await apiFetch('/claude/prompt2blog-credential', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await parseError(response, 'Could not connect Prompt2Blog article account')
  }
  return (await response.json()) as Prompt2BlogCredentialStatus
}

export async function deletePrompt2BlogCredential(): Promise<Prompt2BlogCredentialStatus> {
  const response = await apiFetch('/claude/prompt2blog-credential', { method: 'DELETE' })
  if (!response.ok) {
    throw await parseError(response, 'Could not disconnect Prompt2Blog article account')
  }
  return (await response.json()) as Prompt2BlogCredentialStatus
}

export async function fetchClaudeStatus(): Promise<ClaudeConnectionStatus> {
  const response = await apiFetch('/claude/status')
  if (!response.ok) {
    throw await parseError(response, 'Could not read the Claude connection status')
  }
  return (await response.json()) as ClaudeConnectionStatus
}

/**
 * Ask the backend to open a terminal running `claude auth login` on its own
 * machine. Nothing about the sign-in passes through the browser or the app --
 * the token lands in the host's Keychain, where Claude Code keeps it.
 */
export async function startClaudeLogin(): Promise<ClaudeLoginStart> {
  const response = await apiFetch('/claude/login', { method: 'POST' })
  if (!response.ok) {
    throw await parseError(response, 'Could not start the Claude sign-in')
  }
  return (await response.json()) as ClaudeLoginStart
}

export async function fetchClaudeModels(): Promise<ClaudeModelChoice[]> {
  const response = await apiFetch('/claude/models')
  if (!response.ok) {
    throw await parseError(response, 'Could not load the Claude model list')
  }
  const body = (await response.json()) as { models?: ClaudeModelChoice[] }
  return body.models ?? []
}

export async function sendClaudeTestMessage(
  request: ClaudeTestRequest,
): Promise<ClaudeTestReply> {
  const response = await apiFetch('/claude/test-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw await parseError(response, 'Claude did not answer')
  }
  return (await response.json()) as ClaudeTestReply
}
