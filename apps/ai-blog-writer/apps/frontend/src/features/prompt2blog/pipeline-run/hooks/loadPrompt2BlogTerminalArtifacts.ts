import {
  getPrompt2BlogDebug,
  getPrompt2BlogResult,
  type Prompt2BlogDebugResponse,
  type Prompt2BlogResultResponse,
} from '../../api'

type TerminalArtifactsWithResult = {
  result: Prompt2BlogResultResponse
  debugPayload: Prompt2BlogDebugResponse | null
}

type TerminalArtifactsDebugOnly = {
  result: null
  debugPayload: Prompt2BlogDebugResponse | null
}

export function loadPrompt2BlogTerminalArtifacts(
  runId: string,
  options: { includeResult: false },
): Promise<TerminalArtifactsDebugOnly>

export function loadPrompt2BlogTerminalArtifacts(
  runId: string,
  options?: { includeResult?: true },
): Promise<TerminalArtifactsWithResult>

export async function loadPrompt2BlogTerminalArtifacts(
  runId: string,
  options: { includeResult?: boolean } = {},
): Promise<TerminalArtifactsWithResult | TerminalArtifactsDebugOnly> {
  if (options.includeResult === false) {
    return {
      result: null,
      debugPayload: await getPrompt2BlogDebug(runId).catch(() => null),
    }
  }

  const [result, debugPayload] = await Promise.all([
    getPrompt2BlogResult(runId),
    getPrompt2BlogDebug(runId).catch(() => null),
  ])

  return { result, debugPayload }
}
