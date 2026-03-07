/// <reference types="vitest/importMeta" />

import { parseError } from '../prompt2blog/utils/parse-error'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'
const FEATURE_PREFIX = '/review2blog'

export const REVIEW2BLOG_CATEGORIES = [
  'dining',
  'accommodations',
  'attractions',
  'nightlife',
  'key_locations',
] as const

export type Review2BlogCategory = (typeof REVIEW2BLOG_CATEGORIES)[number]

export type ReviewPayloadReview = Record<string, unknown> & {
  reviewId: string
  source: string
  date: string
  rating: number
  text: string
}

export type EditorialIntentV1 = {
  placement_type: string
  selection_angle: string
  audience: string
  tone: string
  must_mention: string[]
  avoid: string[]
}

export type ReviewPayload = Record<string, unknown> & {
  category: Review2BlogCategory
  name: string
  type: string
  district: string
  locationKey: string
  editorial: EditorialIntentV1
  reviews: ReviewPayloadReview[]
}

export type LocationContextV1 = Record<string, unknown> & {
  category?: Review2BlogCategory | string | null
  name?: string | null
  type?: string | null
  district?: string | null
  location_key?: string | null
  locationKey?: string | null
  priceLevel?: string | null
  idealFor?: string[]
  facts?: Record<string, unknown> | null
}

export type RestaurantContext = {
  id?: number
  name?: string | null
  district?: string | null
  neighborhoodDescription?: string | null
  description?: string | null
  reviews_summary?: string | null
}

export type ListicleConfig = {
  listicle_type: string
  listicle_title: string
  listicle_goal: string
  blurb_length?: string
}

export type Review2BlogBlurbLength = 'short' | 'medium' | 'long'

export type Review2BlogRunListicle = {
  listicle_title: string
  blurb_length: Review2BlogBlurbLength
}

export type Review2BlogConfidence = 'low' | 'medium' | 'high'
export type Review2BlogSentiment = 'positive' | 'negative' | 'mixed' | 'neutral' | 'unknown'
export type Review2BlogIntensity = 'none' | 'low' | 'medium' | 'high'

export type ClaimSignalV1 = {
  review_id?: string | null
  review_source?: string | null
  topic: string
  subject: string
  polarity: Review2BlogSentiment
  strength: 'low' | 'medium' | 'high'
  specificity: 'low' | 'medium' | 'high'
  quote: string
  named_entity: string
  review_date: string
}

export type Review2BlogAspectSignal = {
  mentioned: boolean
  sentiment: Review2BlogSentiment
  intensity: Review2BlogIntensity
  descriptors: string[]
  evidence_quotes: string[]
}

export type Review2BlogVisitContextSignal = {
  value: string
  confidence: Review2BlogConfidence
  evidence: string
}

export type ReviewSignalV2 = {
  date: string
  rating: number
  review_sentiment: Review2BlogSentiment
  specificity: 'low' | 'medium' | 'high'
  contradictions: string[]
  dishes: Array<{
    name: string
    sentiment: Review2BlogSentiment
    evidence_quote: string
  }>
  visit_context: {
    group: Review2BlogVisitContextSignal
    meal: Review2BlogVisitContextSignal
    occasion: Review2BlogVisitContextSignal
  }
  food: Review2BlogAspectSignal
  service: Review2BlogAspectSignal
  atmosphere: Review2BlogAspectSignal
  location: Review2BlogAspectSignal
  value: Review2BlogAspectSignal
}

export type Review2BlogAspectSummary = {
  summary: string
  confidence: Review2BlogConfidence
  support_count: number
  recent_support_count: number
  positive_descriptors: string[]
  negative_descriptors: string[]
  evidence_quotes: string[]
  contradictions: string[]
}

export type Review2BlogServiceSummary = Review2BlogAspectSummary & {
  reliability: 'low' | 'medium' | 'high'
  energy: 'cold' | 'neutral' | 'warm'
}

export type Review2BlogAtmosphereSummary = Review2BlogAspectSummary & {
  noise_level: 'quiet' | 'moderate' | 'loud' | 'unknown'
  best_for: string[]
}

export type Review2BlogValueSummary = Review2BlogAspectSummary & {
  perception: 'poor' | 'fair' | 'good' | 'excellent' | 'mixed'
}

export type Review2BlogCrowdSummary = {
  summary: string
  confidence: Review2BlogConfidence
  group_types: string[]
  common_occasions: string[]
  evidence_quotes: string[]
}

export type Review2BlogStandoutDish = {
  name: string
  positive_count: number
  negative_count: number
  support_count: number
  recent_support_count: number
  evidence_quotes: string[]
}

export type RestaurantProfileV2 = {
  review_count: number
  average_rating: number
  date_range: {
    earliest: string | null
    latest: string | null
  }
  overall_vibe: string
  overall_confidence: Review2BlogConfidence
  contradictions: string[]
  editorial_hooks: string[]
  standout_dishes: Review2BlogStandoutDish[]
  food: Review2BlogAspectSummary
  service: Review2BlogServiceSummary
  atmosphere: Review2BlogAtmosphereSummary
  location: Review2BlogAspectSummary
  value: Review2BlogValueSummary
  crowd: Review2BlogCrowdSummary
}

export type Review2BlogEvidenceClaim = {
  topic: string
  subject: string
  label?: string
  summary?: string
  support_count: number
  recent_support_count: number
  dominant_polarity?: Review2BlogSentiment
  confidence?: Review2BlogConfidence
  strength?: 'low' | 'medium' | 'high'
  specificity?: 'low' | 'medium' | 'high'
  quotes: string[]
  named_entities: string[]
}

export type Review2BlogNamedEntitySupport = {
  name: string
  topic?: string
  support_count: number
  recent_support_count?: number
  positive_count?: number
  negative_count?: number
  quotes: string[]
}

export type Review2BlogContradiction = {
  topic: string
  subject: string
  positive_count: number
  negative_count: number
  quotes: string[]
}

export type Review2BlogTopicBreakdown = {
  topic: string
  support_count: number
  top_subjects: string[]
  quote_samples: string[]
}

export type Review2BlogFactualFit = {
  type?: string | null
  district?: string | null
  metadata_highlights?: string[]
  placement_type?: string | null
  selection_angle?: string | null
}

export type Review2BlogEvidenceProfile = {
  category?: string
  review_count?: number
  claim_count?: number
  date_range?: {
    earliest: string | null
    latest: string | null
  }
  overall_confidence?: Review2BlogConfidence
  ranked_claims: Review2BlogEvidenceClaim[]
  contradictions: Review2BlogContradiction[]
  named_entity_support: Review2BlogNamedEntitySupport[]
  topic_breakdown?: Review2BlogTopicBreakdown[]
  factual_fit?: Review2BlogFactualFit | null
}

export type Review2BlogPhase1Summary = {
  category?: string
  review_count: number
  claim_count?: number
  signal_count?: number
  batch_mode: 'single' | 'batch'
  batch_size: number
  batch_count: number
}

export type Review2BlogPhaseOutputs = Record<string, unknown> & {
  phase1_summary?: Review2BlogPhase1Summary | null
  phase1_claims?: ClaimSignalV1[] | null
  phase2_profile?: Review2BlogEvidenceProfile | RestaurantProfileV2 | Record<string, unknown> | null
  phase2_evidence?: Review2BlogEvidenceProfile | null
  evidence_profile?: Review2BlogEvidenceProfile | null
  ranked_claims?: Review2BlogEvidenceClaim[] | null
  phase3?: { blurb?: string | null; rewrite_applied?: boolean } | null
}

export type Review2BlogArtifactPayload = Record<string, unknown> & {
  run_id: string
  location_name?: string | null
  restaurant_name?: string | null
  location_context?: LocationContextV1 | null
  restaurant_context?: RestaurantContext | null
  editorial_intent?: EditorialIntentV1 | null
  listicle?: Partial<ListicleConfig> | null
  phase_outputs: Review2BlogPhaseOutputs
}

export type Review2BlogStatusState = 'running' | 'awaiting_input' | 'completed' | 'failed'
export type Review2BlogStage =
  | 'queued'
  | 'routing'
  | 'stage_phase1_single'
  | 'stage_phase1_batch'
  | 'stage_phase1_merge'
  | 'stage_phase2'
  | 'awaiting_listicle'
  | 'stage_phase3'
  | 'complete'
  | 'failed'

export type Review2BlogRunRequest = {
  review_payload: ReviewPayload
  listicle: Review2BlogRunListicle
  max_tokens?: number
}

export type Review2BlogResumeRequest = {
  listicle: ListicleConfig
  max_tokens?: number
}

export type Review2BlogRunResponse = {
  message: string
  run_id: string
}

export type Review2BlogStatusResponse = {
  run_id: string
  feature: string
  state: Review2BlogStatusState
  stage: Review2BlogStage
  error: string | null
  updated_at: string
}

export type Review2BlogResultArtifact =
  | {
      review2blog_run?: Review2BlogArtifactPayload
      langsmith_trace_url?: string
      langsmith_trace_run_id?: string
      [key: string]: unknown
    }
  | Review2BlogArtifactPayload

export type Review2BlogResultResponse = {
  run_id: string
  markdown: string | null
  artifact: Review2BlogResultArtifact
  langsmith_trace_url?: string
  langsmith_trace_run_id?: string
}

export type Review2BlogSavedArticle = {
  run_id: string
  title: string
  article_type: 'review2blog'
  location_key?: string
  location_name?: string
  listicle_title?: string
  blurb_length?: string
  created_at: string
  updated_at: string
  markdown: string
  markdown_length: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function ensureObjectPayload(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Review export must be a single JSON object.')
  }
}

function ensureStringField(
  payload: Record<string, unknown>,
  key: string,
  label = key,
): void {
  if (!isNonEmptyString(payload[key])) {
    throw new Error(`Review export must include ${label}.`)
  }
}

function ensureStringArrayField(
  payload: Record<string, unknown>,
  key: string,
  label = key,
): void {
  const value = payload[key]
  if (!Array.isArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    throw new Error(`Review export must include ${label} as a string array.`)
  }
}

function ensureNestedObjectField(
  payload: Record<string, unknown>,
  key: string,
  label = key,
): void {
  if (!isRecord(payload[key])) {
    throw new Error(`Review export must include ${label}.`)
  }
}

function ensureNestedPath(
  payload: Record<string, unknown>,
  path: string[],
  label: string,
): void {
  let current: unknown = payload
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      throw new Error(`Review export must include ${label}.`)
    }
    current = current[key]
  }

  if (current === null || current === undefined) {
    throw new Error(`Review export must include ${label}.`)
  }

  if (typeof current === 'string' && !current.trim()) {
    throw new Error(`Review export must include ${label}.`)
  }
}

function validateEditorialPayload(payload: Record<string, unknown>): void {
  const editorial = payload.editorial
  if (!isRecord(editorial)) {
    throw new Error('Review export must include an editorial object.')
  }

  ensureStringField(editorial, 'placement_type', 'editorial.placement_type')
  ensureStringField(editorial, 'selection_angle', 'editorial.selection_angle')
  ensureStringField(editorial, 'audience', 'editorial.audience')
  ensureStringField(editorial, 'tone', 'editorial.tone')
  ensureStringArrayField(editorial, 'must_mention', 'editorial.must_mention')
  ensureStringArrayField(editorial, 'avoid', 'editorial.avoid')
}

function validateReviews(payload: Record<string, unknown>): void {
  const reviews = payload.reviews
  if (!Array.isArray(reviews) || reviews.length === 0) {
    throw new Error('Review export must include a non-empty reviews array.')
  }

  reviews.forEach((review, index) => {
    if (!isRecord(review)) {
      throw new Error(`Review ${index + 1} must be an object.`)
    }

    if (!isNonEmptyString(review.text)) {
      throw new Error(`Review ${index + 1} must include text.`)
    }

    if (!isNonEmptyString(review.reviewId)) {
      throw new Error(`Review ${index + 1} must include reviewId.`)
    }

    if (!isNonEmptyString(review.source)) {
      throw new Error(`Review ${index + 1} must include source.`)
    }

    if (!isNonEmptyString(review.date)) {
      throw new Error(`Review ${index + 1} must include date.`)
    }

    if (typeof review.rating !== 'number' || !Number.isFinite(review.rating)) {
      throw new Error(`Review ${index + 1} must include numeric rating.`)
    }
  })
}

function validateCategorySpecificFields(payload: Record<string, unknown>): void {
  const category = payload.category
  if (!isNonEmptyString(category) || !REVIEW2BLOG_CATEGORIES.includes(category as Review2BlogCategory)) {
    throw new Error(
      `Review export must include category as one of: ${REVIEW2BLOG_CATEGORIES.join(', ')}.`,
    )
  }

  switch (category as Review2BlogCategory) {
    case 'dining':
      ensureStringField(payload, 'priceLevel', 'priceLevel')
      ensureStringArrayField(payload, 'idealFor', 'idealFor')
      ensureStringArrayField(payload, 'tripadvisorCuisines', 'tripadvisorCuisines')
      ensureStringArrayField(payload, 'tripadvisorMealTypes', 'tripadvisorMealTypes')
      ensureStringArrayField(payload, 'tripadvisorFeatures', 'tripadvisorFeatures')
      ensureNestedObjectField(payload, 'operationHours', 'operationHours')
      break
    case 'accommodations':
      ensureStringField(payload, 'priceLevel', 'priceLevel')
      ensureNestedObjectField(payload, 'accommodationsDetails', 'accommodationsDetails')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_stay', 'perfect_for'], 'accommodationsDetails.the_stay.perfect_for')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_stay', 'kid_friendly'], 'accommodationsDetails.the_stay.kid_friendly')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_stay', 'wifi'], 'accommodationsDetails.the_stay.wifi')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_stay', 'ac'], 'accommodationsDetails.the_stay.ac')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_stay', 'breakfast_served'], 'accommodationsDetails.the_stay.breakfast_served')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_stay', 'parking'], 'accommodationsDetails.the_stay.parking')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_experience', 'vibe'], 'accommodationsDetails.the_experience.vibe')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_experience', 'workspace'], 'accommodationsDetails.the_experience.workspace')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_experience', 'pool'], 'accommodationsDetails.the_experience.pool')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_experience', 'rooftop_lounge'], 'accommodationsDetails.the_experience.rooftop_lounge')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_experience', 'gym'], 'accommodationsDetails.the_experience.gym')
      ensureNestedPath(payload, ['accommodationsDetails', 'the_details', 'walkability'], 'accommodationsDetails.the_details.walkability')
      break
    case 'attractions':
      ensureStringArrayField(payload, 'idealFor', 'idealFor')
      ensureNestedObjectField(payload, 'attractionsDetails', 'attractionsDetails')
      ensureStringField(payload, 'priceLevel', 'priceLevel')
      ensureNestedPath(payload, ['attractionsDetails', 'core', 'attraction_type'], 'attractionsDetails.core.attraction_type')
      ensureNestedPath(payload, ['attractionsDetails', 'core', 'pricing'], 'attractionsDetails.core.pricing')
      ensureNestedPath(payload, ['attractionsDetails', 'visit', 'booking_required'], 'attractionsDetails.visit.booking_required')
      ensureNestedObjectField(payload, 'operationHours', 'operationHours')
      break
    case 'nightlife':
      ensureStringArrayField(payload, 'idealFor', 'idealFor')
      ensureNestedObjectField(payload, 'nightlifeDetails', 'nightlifeDetails')
      ensureNestedPath(payload, ['nightlifeDetails', 'price_tier'], 'nightlifeDetails.price_tier')
      ensureNestedPath(payload, ['nightlifeDetails', 'music'], 'nightlifeDetails.music')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theSpace', 'venueType', 'value'], 'nightlifeDetails.details.theSpace.venueType.value')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theSpace', 'venueSize', 'value'], 'nightlifeDetails.details.theSpace.venueSize.value')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theSpace', 'vibe', 'value'], 'nightlifeDetails.details.theSpace.vibe.value')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theSpace', 'peakHours', 'value'], 'nightlifeDetails.details.theSpace.peakHours.value')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theScene', 'dressCode', 'value'], 'nightlifeDetails.details.theScene.dressCode.value')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theScene', 'energyLevel', 'value'], 'nightlifeDetails.details.theScene.energyLevel.value')
      ensureNestedPath(payload, ['nightlifeDetails', 'details', 'theScene', 'crowdProfile', 'value'], 'nightlifeDetails.details.theScene.crowdProfile.value')
      ensureNestedObjectField(payload, 'operationHours', 'operationHours')
      break
    case 'key_locations':
      ensureNestedObjectField(payload, 'keyLocationsDetails', 'keyLocationsDetails')
      ensureNestedPath(payload, ['keyLocationsDetails', 'location_type'], 'keyLocationsDetails.location_type')
      ensureNestedPath(payload, ['keyLocationsDetails', 'neighborhood'], 'keyLocationsDetails.neighborhood')
      ensureNestedPath(payload, ['keyLocationsDetails', 'status'], 'keyLocationsDetails.status')
      ensureNestedObjectField(payload, 'operationHours', 'operationHours')
      break
  }
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }

  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(new Error('Failed to read JSON file.'))
      reader.readAsText(file)
    })
  }

  throw new Error('Failed to read JSON file.')
}

export async function parseReviewJsonFile(file: File): Promise<ReviewPayload> {
  if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
    throw new Error('Please choose a JSON file.')
  }

  const rawText = await readFileText(file)
  let parsed: unknown

  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Invalid JSON file.')
  }

  ensureObjectPayload(parsed)
  ensureStringField(parsed, 'name', 'name')
  ensureStringField(parsed, 'type', 'type')
  ensureStringField(parsed, 'district', 'district')
  ensureStringField(parsed, 'locationKey', 'locationKey')
  validateEditorialPayload(parsed)
  validateReviews(parsed)
  validateCategorySpecificFields(parsed)

  return parsed as ReviewPayload
}

export async function startReview2BlogRun(
  request: Review2BlogRunRequest,
): Promise<Review2BlogRunResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw await parseError(response, 'Failed to start Review2Blog run')
  }

  return response.json()
}

export async function resumeReview2BlogRun(
  runId: string,
  request: Review2BlogResumeRequest,
): Promise<Review2BlogRunResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/run/${runId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw await parseError(response, 'Failed to resume Review2Blog run')
  }

  return response.json()
}

export async function getReview2BlogStatus(
  runId: string,
): Promise<Review2BlogStatusResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/status/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Review2Blog status')
  }

  return response.json()
}

export async function getReview2BlogResult(
  runId: string,
): Promise<Review2BlogResultResponse> {
  const response = await fetch(`${API_BASE_URL}${FEATURE_PREFIX}/result/${runId}`)

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch Review2Blog result')
  }

  return response.json()
}

export async function getReview2BlogArticles(
  locationKey?: string | null,
): Promise<Review2BlogSavedArticle[]> {
  const url = new URL(`${API_BASE_URL}${FEATURE_PREFIX}/articles`)
  if (locationKey?.trim()) {
    url.searchParams.set('location_key', locationKey.trim())
  }

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch saved Review2Blog blurbs')
  }

  return response.json()
}

export function getReview2BlogArtifact(
  result: Review2BlogResultResponse | null | undefined,
): Review2BlogArtifactPayload | null {
  const artifact = result?.artifact

  if (!artifact || typeof artifact !== 'object') {
    return null
  }

  if ('review2blog_run' in artifact) {
    const nested = artifact.review2blog_run
    if (nested && typeof nested === 'object' && 'phase_outputs' in nested) {
      return nested as Review2BlogArtifactPayload
    }
  }

  if ('phase_outputs' in artifact && artifact.phase_outputs && typeof artifact.phase_outputs === 'object') {
    return artifact as Review2BlogArtifactPayload
  }

  return null
}

export function getReview2BlogTraceUrl(
  result: Review2BlogResultResponse | null | undefined,
): string | null {
  if (typeof result?.langsmith_trace_url === 'string' && result.langsmith_trace_url.trim()) {
    return result.langsmith_trace_url.trim()
  }

  const artifact = result?.artifact
  if (artifact && typeof artifact === 'object') {
    const value = artifact.langsmith_trace_url
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

export function getReview2BlogLocationContext(
  artifact: Review2BlogArtifactPayload | null | undefined,
  reviewPayload?: ReviewPayload | null,
): LocationContextV1 | null {
  if (artifact?.location_context && isRecord(artifact.location_context)) {
    return artifact.location_context
  }

  if (artifact?.restaurant_context && isRecord(artifact.restaurant_context)) {
    return artifact.restaurant_context as LocationContextV1
  }

  if (reviewPayload) {
    return {
      category: reviewPayload.category,
      name: reviewPayload.name,
      type: reviewPayload.type,
      district: reviewPayload.district,
      locationKey: reviewPayload.locationKey,
      priceLevel: typeof reviewPayload.priceLevel === 'string' ? reviewPayload.priceLevel : null,
      idealFor: Array.isArray(reviewPayload.idealFor)
        ? reviewPayload.idealFor.filter((value): value is string => isNonEmptyString(value))
        : [],
      ...reviewPayload,
    }
  }

  return null
}

export function getReview2BlogEditorialIntent(
  artifact: Review2BlogArtifactPayload | null | undefined,
  reviewPayload?: ReviewPayload | null,
): EditorialIntentV1 | null {
  if (artifact?.editorial_intent && isRecord(artifact.editorial_intent)) {
    return artifact.editorial_intent as EditorialIntentV1
  }

  if (reviewPayload?.editorial && isRecord(reviewPayload.editorial)) {
    return reviewPayload.editorial
  }

  if (artifact?.listicle && isRecord(artifact.listicle)) {
    return {
      placement_type: typeof artifact.listicle.listicle_type === 'string' ? artifact.listicle.listicle_type : '',
      selection_angle: typeof artifact.listicle.listicle_goal === 'string' ? artifact.listicle.listicle_goal : '',
      audience: '',
      tone: '',
      must_mention: [],
      avoid: [],
    }
  }

  return null
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest

  describe('parseReviewJsonFile', () => {
    it('parses a valid category-aware review payload on the client', async () => {
      const file = new File(
        [
          JSON.stringify({
            category: 'dining',
            name: 'Mar y Sol',
            type: 'seafood-restaurant',
            district: 'Barranco',
            locationKey: 'peru|lima|barranco',
            editorial: {
              placement_type: 'guide',
              selection_angle: 'best seafood dinners',
              audience: 'travelers',
              tone: 'grounded',
              must_mention: ['ceviche'],
              avoid: ['luxury'],
            },
            idealFor: ['date night'],
            priceLevel: '$$$',
            tripadvisorCuisines: ['Peruvian'],
            tripadvisorMealTypes: ['Dinner'],
            tripadvisorFeatures: ['Reservations'],
            operationHours: { hours: [{ day: 'Monday', hours: '12:00-22:00' }] },
            reviews: [
              {
                reviewId: 'rev-1',
                source: 'google',
                text: 'Great',
                rating: 5,
                date: '2025-01-01',
              },
            ],
          }),
        ],
        'reviews.json',
        { type: 'application/json' },
      )

      await expect(parseReviewJsonFile(file)).resolves.toMatchObject({
        category: 'dining',
        name: 'Mar y Sol',
        reviews: [{ reviewId: 'rev-1', text: 'Great', rating: 5, date: '2025-01-01' }],
      })
    })

    it('rejects exports without editorial constraints', async () => {
      const file = new File(
        [
          JSON.stringify({
            category: 'dining',
            name: 'Mar y Sol',
            type: 'seafood-restaurant',
            district: 'Barranco',
            locationKey: 'peru|lima|barranco',
            idealFor: ['date night'],
            priceLevel: '$$$',
            tripadvisorCuisines: ['Peruvian'],
            tripadvisorMealTypes: ['Dinner'],
            tripadvisorFeatures: ['Reservations'],
            operationHours: { hours: [{ day: 'Monday', hours: '12:00-22:00' }] },
            reviews: [
              {
                reviewId: 'rev-1',
                source: 'google',
                text: 'Great',
                rating: 5,
                date: '2025-01-01',
              },
            ],
          }),
        ],
        'reviews.json',
        { type: 'application/json' },
      )

      await expect(parseReviewJsonFile(file)).rejects.toThrow(
        'Review export must include an editorial object.',
      )
    })

    it('rejects unsupported categories', async () => {
      const file = new File(
        [
          JSON.stringify({
            category: 'cafes',
            name: 'Mar y Sol',
            type: 'cafe',
            district: 'Barranco',
            locationKey: 'peru|lima|barranco',
            editorial: {
              placement_type: 'guide',
              selection_angle: 'best seafood dinners',
              audience: 'travelers',
              tone: 'grounded',
              must_mention: ['ceviche'],
              avoid: ['luxury'],
            },
            reviews: [
              {
                reviewId: 'rev-1',
                source: 'google',
                text: 'Great',
                rating: 5,
                date: '2025-01-01',
              },
            ],
          }),
        ],
        'reviews.json',
        { type: 'application/json' },
      )

      await expect(parseReviewJsonFile(file)).rejects.toThrow(
        'Review export must include category as one of: dining, accommodations, attractions, nightlife, key_locations.',
      )
    })
  })

  describe('getReview2BlogArtifact', () => {
    it('unwraps nested review2blog artifacts', () => {
      const artifact = getReview2BlogArtifact({
        run_id: 'run-1',
        markdown: null,
        artifact: {
          review2blog_run: {
            run_id: 'run-1',
            location_context: {
              name: 'Mar y Sol',
            },
            phase_outputs: {
              phase1_summary: {
                review_count: 1,
                claim_count: 1,
                batch_mode: 'single',
                batch_size: 50,
                batch_count: 1,
              },
            },
          },
        },
      })

      expect(artifact?.run_id).toBe('run-1')
      expect(artifact?.phase_outputs.phase1_summary?.claim_count).toBe(1)
    })
  })

  describe('getReview2BlogEditorialIntent', () => {
    it('falls back to legacy listicle payloads when editorial intent is absent', () => {
      const editorial = getReview2BlogEditorialIntent({
        run_id: 'run-legacy',
        listicle: {
          listicle_type: 'date night',
          listicle_title: 'Best Date Night Spots',
          listicle_goal: 'Find romantic dinner options',
        },
        phase_outputs: {},
      })

      expect(editorial).toEqual({
        placement_type: 'date night',
        selection_angle: 'Find romantic dinner options',
        audience: '',
        tone: '',
        must_mention: [],
        avoid: [],
      })
    })
  })
}
