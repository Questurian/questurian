export type DebugResponse = {
  run_id: string
  status: Record<string, unknown>
  stages: Record<string, unknown>
  output: Record<string, unknown> | null
}
