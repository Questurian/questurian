export type ArticleTypeOption = {
  name: string
  definition: string
}

export type ClassificationResult = {
  id: number
  name: string
  definition: string
  confidence: number
  reasoning: string
}

export type ClassifyResponse = {
  result: string
  classification: ClassificationResult
}

export type ArticleTypeGuidelines = {
  id: number
  name: string
  guideline: string | null
  title_guideline: string | null
}
