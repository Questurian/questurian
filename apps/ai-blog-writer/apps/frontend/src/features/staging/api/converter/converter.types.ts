export type LexicalConvertResponse = {
  success: boolean
  data?: object
  error?: string
  metadata?: {
    nodeCount: number
    hasContent: boolean
    timestamp: string
  }
}
