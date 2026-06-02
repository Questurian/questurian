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
  options: { includeResult: false; suppressDebugErrors?: boolean },
): Promise<TerminalArtifactsDebugOnly>

export function loadPrompt2BlogTerminalArtifacts(
  runId: string,
  options?: { includeResult?: true; suppressDebugErrors?: boolean },
): Promise<TerminalArtifactsWithResult>

export async function loadPrompt2BlogTerminalArtifacts(
  runId: string,
  options: { includeResult?: boolean; suppressDebugErrors?: boolean } = {},
): Promise<TerminalArtifactsWithResult | TerminalArtifactsDebugOnly> {
  const loadDebugPayload = () => options.suppressDebugErrors === false
    ? getPrompt2BlogDebug(runId)
    : getPrompt2BlogDebug(runId).catch(() => null)

  if (options.includeResult === false) {
    return {
      result: null,
      debugPayload: await loadDebugPayload(),
    }
  }

  const [result, debugPayload] = await Promise.all([
    getPrompt2BlogResult(runId),
    loadDebugPayload(),
  ])

  return { result, debugPayload }
}
