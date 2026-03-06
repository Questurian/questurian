/// <reference types="vitest/importMeta" />

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  getReview2BlogArtifact,
  getReview2BlogEditorialIntent,
  getReview2BlogLocationContext,
  getReview2BlogResult,
  getReview2BlogStatus,
  getReview2BlogTraceUrl,
  parseReviewJsonFile,
  resumeReview2BlogRun,
  startReview2BlogRun,
  type ClaimSignalV1,
  type EditorialIntentV1,
  type ListicleConfig,
  type RestaurantProfileV2,
  type Review2BlogArtifactPayload,
  type Review2BlogCategory,
  type Review2BlogEvidenceClaim,
  type Review2BlogNamedEntitySupport,
  type Review2BlogPhase1Summary,
  type Review2BlogResultResponse,
  type Review2BlogStage,
  type Review2BlogStatusResponse,
  type ReviewPayload,
} from './api'
import './styles.css'

type PhaseStatus = 'pending' | 'running' | 'done' | 'error'
type WizardStep = 'upload' | 'processing' | 'awaiting-input' | 'complete' | 'failed'

type StageMeta = {
  label: string
  message: string
}

type FactItem = {
  label: string
  value: string
}

type FactSection = {
  title: string
  items: FactItem[]
}

type ReviewStats = {
  reviewCount: number
  averageRating: number | null
  sourceCount: number
  earliestDate: string | null
  latestDate: string | null
}

type EvidenceCardData = {
  key: string
  title: string
  topic: string
  summary: string
  supportCount: number
  recentSupportCount: number | null
  quotes: string[]
  chips: string[]
  contradictions: string[]
  namedEntities: string[]
}

const REVIEW2BLOG_STAGE_META: Record<Review2BlogStage, StageMeta> = {
  queued: {
    label: 'Queued',
    message: 'Queuing the export and preparing the category-aware Review2Blog graph.',
  },
  routing: {
    label: 'Routing',
    message: 'Validating the uploaded export and deciding between single-pass extraction and batch mode.',
  },
  stage_phase1_single: {
    label: 'Phase 1: Claim extraction',
    message: 'Extracting review-backed claim signals from the exported review corpus.',
  },
  stage_phase1_batch: {
    label: 'Phase 1: Batched extraction',
    message: 'Chunking a larger review set and extracting claim signals across batches.',
  },
  stage_phase1_merge: {
    label: 'Phase 1: Merge',
    message: 'Merging batched claim signals into a single evidence set.',
  },
  stage_phase2: {
    label: 'Phase 2: Evidence ranking',
    message: 'Ranking repeated evidence, contradictions, and support counts from the reviews.',
  },
  awaiting_listicle: {
    label: 'Legacy pause',
    message: 'This run paused waiting for legacy listicle inputs. JSON-only exports should normally bypass this state.',
  },
  stage_phase3: {
    label: 'Phase 3: Category writer',
    message: 'Generating and validating the final category-aware blurb from review-backed evidence.',
  },
  complete: {
    label: 'Complete',
    message: 'The run finished and the final blurb plus markdown are ready.',
  },
  failed: {
    label: 'Failed',
    message: 'The run stopped before completion.',
  },
}

function createEmptyLegacyListicle(): ListicleConfig {
  return {
    listicle_type: '',
    listicle_title: '',
    listicle_goal: '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => readString(entry))
    .filter(Boolean)
}

function getPath(source: Record<string, unknown> | null | undefined, path: string[]): unknown {
  if (!source) {
    return undefined
  }

  let current: unknown = source
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

function pickFirstValue(
  source: Record<string, unknown> | null | undefined,
  paths: string[][],
): unknown {
  for (const path of paths) {
    const value = getPath(source, path)
    if (typeof value === 'string' && value.trim()) {
      return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'boolean') {
      return value
    }
    if (Array.isArray(value) && value.length > 0) {
      return value
    }
    if (isRecord(value) && Object.keys(value).length > 0) {
      return value
    }
  }

  return undefined
}

function toSentenceCase(value: string): string {
  if (!value) {
    return ''
  }

  const normalized = value.replace(/[_-]+/g, ' ').trim()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatCategoryLabel(value: string | null | undefined): string {
  return value ? toSentenceCase(value) : 'Unknown category'
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateRange(earliest: string | null, latest: string | null): string {
  if (!earliest && !latest) {
    return 'Not available'
  }

  const earliestLabel = formatDateLabel(earliest)
  const latestLabel = formatDateLabel(latest)
  return earliestLabel === latestLabel ? earliestLabel : `${earliestLabel} to ${latestLabel}`
}

function formatBatchMode(summary: Review2BlogPhase1Summary | null | undefined): string {
  if (!summary) {
    return 'Not available'
  }

  if (summary.batch_mode === 'batch') {
    return `${summary.batch_count} batches`
  }

  return 'Single pass'
}

function formatFactValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => formatFactValue(entry))
      .filter(Boolean)
    return parts.join(', ')
  }

  if (isRecord(value)) {
    if (Array.isArray(value.hours)) {
      const hours = value.hours
        .map((entry) => {
          if (!isRecord(entry)) {
            return ''
          }

          const day = readString(entry.day)
          const range = readString(entry.hours)
          return day && range ? `${day}: ${range}` : ''
        })
        .filter(Boolean)

      return hours.slice(0, 3).join(' · ')
    }

    const label = readString(value.label)
    const nestedValue = value.value
    if (label && typeof nestedValue === 'string' && nestedValue.trim()) {
      return nestedValue.trim()
    }

    if (Array.isArray(nestedValue)) {
      return nestedValue.map((entry) => formatFactValue(entry)).filter(Boolean).join(', ')
    }

    if (typeof nestedValue === 'string') {
      return nestedValue.trim()
    }
  }

  return ''
}

function buildReviewStats(payload: ReviewPayload | null | undefined): ReviewStats {
  if (!payload) {
    return {
      reviewCount: 0,
      averageRating: null,
      sourceCount: 0,
      earliestDate: null,
      latestDate: null,
    }
  }

  const ratings = payload.reviews
    .map((review) => readNumber(review.rating))
    .filter((rating): rating is number => rating !== null)
  const dates = payload.reviews
    .map((review) => readString(review.date))
    .filter(Boolean)
    .sort()
  const sources = new Set(
    payload.reviews
      .map((review) => readString(review.source))
      .filter(Boolean),
  )

  return {
    reviewCount: payload.reviews.length,
    averageRating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    sourceCount: sources.size,
    earliestDate: dates[0] ?? null,
    latestDate: dates.at(-1) ?? null,
  }
}

function getWizardStep({
  hasRunStarted,
  startPending,
  status,
  result,
}: {
  hasRunStarted: boolean
  startPending: boolean
  status: Review2BlogStatusResponse | null | undefined
  result: Review2BlogResultResponse | null | undefined
}): WizardStep {
  if (!hasRunStarted && !startPending) {
    return 'upload'
  }

  if (status?.state === 'failed') {
    return 'failed'
  }

  if (status?.state === 'completed' && result) {
    return 'complete'
  }

  if (status?.state === 'awaiting_input') {
    return 'awaiting-input'
  }

  return 'processing'
}

function getPhaseStatuses(
  status: Review2BlogStatusResponse | null | undefined,
  hasRunStarted: boolean,
): {
  phase1Status: PhaseStatus
  phase2Status: PhaseStatus
  phase3Status: PhaseStatus
} {
  if (!hasRunStarted) {
    return {
      phase1Status: 'pending',
      phase2Status: 'pending',
      phase3Status: 'pending',
    }
  }

  if (!status) {
    return {
      phase1Status: 'running',
      phase2Status: 'pending',
      phase3Status: 'pending',
    }
  }

  const stage = status.stage
  const failed = status.state === 'failed'

  const phase1Status: PhaseStatus = failed
    ? ['routing', 'stage_phase1_single', 'stage_phase1_batch', 'stage_phase1_merge'].includes(stage)
      ? 'error'
      : 'done'
    : ['stage_phase2', 'awaiting_listicle', 'stage_phase3', 'complete'].includes(stage)
      ? 'done'
      : 'running'

  const phase2Status: PhaseStatus = failed
    ? stage === 'stage_phase2'
      ? 'error'
      : ['awaiting_listicle', 'stage_phase3', 'complete'].includes(stage)
        ? 'done'
        : 'pending'
    : ['awaiting_listicle', 'stage_phase3', 'complete'].includes(stage)
      ? 'done'
      : stage === 'stage_phase2'
        ? 'running'
        : 'pending'

  const phase3Status: PhaseStatus = failed
    ? stage === 'stage_phase3'
      ? 'error'
      : 'pending'
    : status.state === 'completed'
      ? 'done'
      : stage === 'stage_phase3'
        ? 'running'
        : 'pending'

  return { phase1Status, phase2Status, phase3Status }
}

function buildStageFailureMessage(
  status: Review2BlogStatusResponse | null | undefined,
): string {
  if (!status || status.state !== 'failed') {
    return ''
  }

  const meta = REVIEW2BLOG_STAGE_META[status.stage] ?? REVIEW2BLOG_STAGE_META.failed
  if (status.error?.trim()) {
    return `${meta.label} failed: ${status.error.trim()}`
  }
  return `${meta.label} failed.`
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard access is not available in this browser.')
  }

  await navigator.clipboard.writeText(text)
}

function isLegacyResumeValid(config: ListicleConfig): boolean {
  return Boolean(
    config.listicle_type.trim() &&
      config.listicle_title.trim() &&
      config.listicle_goal.trim(),
  )
}

function asLegacyProfile(value: unknown): RestaurantProfileV2 | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    typeof value.review_count === 'number' &&
    typeof value.average_rating === 'number' &&
    isRecord(value.food) &&
    isRecord(value.service)
  ) {
    return value as RestaurantProfileV2
  }

  return null
}

function buildFactSections(
  source: Record<string, unknown> | null | undefined,
  editorial: EditorialIntentV1 | null,
): FactSection[] {
  if (!source) {
    return []
  }

  const category = readString(source.category)
  const sections: FactSection[] = []
  const coreItems: FactItem[] = []

  const corePairs: Array<{ label: string; paths: string[][] }> = [
    { label: 'Category', paths: [['category']] },
    { label: 'Type', paths: [['type']] },
    { label: 'District', paths: [['district']] },
    { label: 'Location key', paths: [['locationKey'], ['location_key']] },
    { label: 'Price level', paths: [['priceLevel'], ['facts', 'priceLevel'], ['facts', 'price_level']] },
    { label: 'Ideal for', paths: [['idealFor'], ['facts', 'idealFor'], ['facts', 'ideal_for']] },
  ]

  corePairs.forEach(({ label, paths }) => {
    const value = formatFactValue(pickFirstValue(source, paths))
    if (value) {
      coreItems.push({
        label,
        value: label === 'Category' ? formatCategoryLabel(value) : value,
      })
    }
  })

  if (coreItems.length > 0) {
    sections.push({ title: 'Core facts', items: coreItems })
  }

  const categoryPairs: Record<Review2BlogCategory, Array<{ label: string; paths: string[][] }>> = {
    dining: [
      { label: 'Cuisines', paths: [['tripadvisorCuisines'], ['facts', 'cuisines']] },
      { label: 'Meal types', paths: [['tripadvisorMealTypes'], ['facts', 'mealTypes'], ['facts', 'meal_types']] },
      { label: 'Features', paths: [['tripadvisorFeatures'], ['facts', 'features']] },
      { label: 'Hours', paths: [['operationHours'], ['facts', 'operationHours'], ['facts', 'operation_hours']] },
    ],
    accommodations: [
      {
        label: 'Perfect for',
        paths: [['accommodationsDetails', 'the_stay', 'perfect_for'], ['facts', 'perfectFor'], ['facts', 'perfect_for']],
      },
      { label: 'Wi-Fi', paths: [['accommodationsDetails', 'the_stay', 'wifi'], ['facts', 'wifi']] },
      { label: 'A/C', paths: [['accommodationsDetails', 'the_stay', 'ac'], ['facts', 'ac']] },
      {
        label: 'Breakfast served',
        paths: [['accommodationsDetails', 'the_stay', 'breakfast_served'], ['facts', 'breakfastServed'], ['facts', 'breakfast_served']],
      },
      { label: 'Pool', paths: [['accommodationsDetails', 'the_experience', 'pool'], ['facts', 'pool']] },
      {
        label: 'Rooftop lounge',
        paths: [['accommodationsDetails', 'the_experience', 'rooftop_lounge'], ['facts', 'rooftopLounge'], ['facts', 'rooftop_lounge']],
      },
      { label: 'Workspace', paths: [['accommodationsDetails', 'the_experience', 'workspace'], ['facts', 'workspace']] },
      { label: 'Gym', paths: [['accommodationsDetails', 'the_experience', 'gym'], ['facts', 'gym']] },
      { label: 'Walkability', paths: [['accommodationsDetails', 'the_details', 'walkability'], ['facts', 'walkability']] },
    ],
    attractions: [
      {
        label: 'Attraction type',
        paths: [['attractionsDetails', 'core', 'attraction_type'], ['facts', 'attractionType'], ['facts', 'attraction_type']],
      },
      { label: 'Pricing', paths: [['attractionsDetails', 'core', 'pricing'], ['facts', 'pricing']] },
      {
        label: 'Booking required',
        paths: [['attractionsDetails', 'visit', 'booking_required'], ['facts', 'bookingRequired'], ['facts', 'booking_required']],
      },
      { label: 'Hours', paths: [['operationHours'], ['facts', 'operationHours'], ['facts', 'operation_hours']] },
    ],
    nightlife: [
      { label: 'Price tier', paths: [['nightlifeDetails', 'price_tier'], ['facts', 'priceTier'], ['facts', 'price_tier']] },
      { label: 'Music', paths: [['nightlifeDetails', 'music'], ['facts', 'music']] },
      {
        label: 'Venue type',
        paths: [['nightlifeDetails', 'details', 'theSpace', 'venueType', 'value'], ['facts', 'venueType'], ['facts', 'venue_type']],
      },
      {
        label: 'Venue size',
        paths: [['nightlifeDetails', 'details', 'theSpace', 'venueSize', 'value'], ['facts', 'venueSize'], ['facts', 'venue_size']],
      },
      {
        label: 'Vibe',
        paths: [['nightlifeDetails', 'details', 'theSpace', 'vibe', 'value'], ['facts', 'vibe']],
      },
      {
        label: 'Peak hours',
        paths: [['nightlifeDetails', 'details', 'theSpace', 'peakHours', 'value'], ['facts', 'peakHours'], ['facts', 'peak_hours']],
      },
      {
        label: 'Dress code',
        paths: [['nightlifeDetails', 'details', 'theScene', 'dressCode', 'value'], ['facts', 'dressCode'], ['facts', 'dress_code']],
      },
      {
        label: 'Energy level',
        paths: [['nightlifeDetails', 'details', 'theScene', 'energyLevel', 'value'], ['facts', 'energyLevel'], ['facts', 'energy_level']],
      },
      {
        label: 'Crowd profile',
        paths: [['nightlifeDetails', 'details', 'theScene', 'crowdProfile', 'value'], ['facts', 'crowdProfile'], ['facts', 'crowd_profile']],
      },
      { label: 'Hours', paths: [['operationHours'], ['facts', 'operationHours'], ['facts', 'operation_hours']] },
    ],
    key_locations: [
      {
        label: 'Location type',
        paths: [['keyLocationsDetails', 'location_type'], ['facts', 'locationType'], ['facts', 'location_type']],
      },
      {
        label: 'Neighborhood',
        paths: [['keyLocationsDetails', 'neighborhood'], ['facts', 'neighborhood']],
      },
      { label: 'Status', paths: [['keyLocationsDetails', 'status'], ['facts', 'status']] },
      { label: 'Hours', paths: [['operationHours'], ['facts', 'operationHours'], ['facts', 'operation_hours']] },
    ],
  }

  const categoryItems =
    category && category in categoryPairs
      ? categoryPairs[category as Review2BlogCategory]
          .map(({ label, paths }) => {
            const value = formatFactValue(pickFirstValue(source, paths))
            return value ? { label, value } : null
          })
          .filter((item): item is FactItem => item !== null)
      : []

  if (categoryItems.length > 0) {
    sections.push({ title: 'Category facts', items: categoryItems })
  }

  if (editorial) {
    const editorialItems: FactItem[] = [
      { label: 'Placement type', value: editorial.placement_type },
      { label: 'Selection angle', value: editorial.selection_angle },
      { label: 'Audience', value: editorial.audience },
      { label: 'Tone', value: editorial.tone },
      { label: 'Must mention', value: editorial.must_mention.join(', ') },
      { label: 'Avoid', value: editorial.avoid.join(', ') },
    ].filter((item) => item.value)

    if (editorialItems.length > 0) {
      sections.push({ title: 'Editorial constraints', items: editorialItems })
    }
  }

  return sections
}

function buildEvidenceCardsFromRankedClaims(claims: Review2BlogEvidenceClaim[]): EvidenceCardData[] {
  return claims
    .map((claim, index) => ({
      key: `ranked-${index}-${claim.topic}-${claim.subject}`,
      title: claim.label || claim.subject || toSentenceCase(claim.topic),
      topic: claim.topic,
      summary:
        claim.summary ||
        (claim.subject
          ? `Repeated reviews point to ${claim.subject}.`
          : `Repeated reviews support this ${toSentenceCase(claim.topic).toLowerCase()} signal.`),
      supportCount: claim.support_count,
      recentSupportCount: claim.recent_support_count,
      quotes: claim.quotes.slice(0, 3),
      chips: [claim.dominant_polarity, claim.confidence, claim.strength]
        .filter((value): value is string => Boolean(value)),
      contradictions: [],
      namedEntities: claim.named_entities,
    }))
    .sort((left, right) => right.supportCount - left.supportCount)
}

function buildEvidenceCardsFromClaimSignals(claims: ClaimSignalV1[]): EvidenceCardData[] {
  const grouped = new Map<
    string,
    {
      topic: string
      subject: string
      supportCount: number
      quotes: string[]
      namedEntities: string[]
      polarityCounts: Map<string, number>
    }
  >()

  claims.forEach((claim) => {
    const subject = readString(claim.subject) || readString(claim.named_entity) || toSentenceCase(claim.topic)
    const key = `${claim.topic}::${subject}`
    const current =
      grouped.get(key) ??
      {
        topic: claim.topic,
        subject,
        supportCount: 0,
        quotes: [],
        namedEntities: [],
        polarityCounts: new Map<string, number>(),
      }

    current.supportCount += 1
    if (claim.quote) {
      current.quotes.push(claim.quote)
    }
    if (claim.named_entity) {
      current.namedEntities.push(claim.named_entity)
    }
    current.polarityCounts.set(
      claim.polarity,
      (current.polarityCounts.get(claim.polarity) ?? 0) + 1,
    )
    grouped.set(key, current)
  })

  return Array.from(grouped.values())
    .map((entry, index) => {
      const leadingPolarity = Array.from(entry.polarityCounts.entries()).sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0]

      return {
        key: `claim-${index}-${entry.topic}-${entry.subject}`,
        title: entry.subject,
        topic: entry.topic,
        summary: `Review-backed mentions cluster around ${entry.subject.toLowerCase()}.`,
        supportCount: entry.supportCount,
        recentSupportCount: null,
        quotes: entry.quotes.slice(0, 3),
        chips: [leadingPolarity].filter((value): value is string => Boolean(value)),
        contradictions: [],
        namedEntities: Array.from(new Set(entry.namedEntities)).slice(0, 4),
      }
    })
    .sort((left, right) => right.supportCount - left.supportCount)
}

function buildEvidenceCardsFromLegacyProfile(profile: RestaurantProfileV2): EvidenceCardData[] {
  const cards: EvidenceCardData[] = []

  profile.standout_dishes.forEach((dish) => {
    cards.push({
      key: `dish-${dish.name}`,
      title: dish.name,
      topic: 'food',
      summary: `Repeated reviews specifically call out ${dish.name}.`,
      supportCount: dish.support_count,
      recentSupportCount: dish.recent_support_count,
      quotes: dish.evidence_quotes.slice(0, 3),
      chips: [
        `${dish.positive_count} positive`,
        `${dish.negative_count} negative`,
      ],
      contradictions: [],
      namedEntities: [dish.name],
    })
  })

  const aspectPairs = [
    ['Food', profile.food],
    ['Service', profile.service],
    ['Atmosphere', profile.atmosphere],
    ['Location', profile.location],
    ['Value', profile.value],
  ] as const

  aspectPairs.forEach(([title, aspect]) => {
    const chips = [
      ...aspect.positive_descriptors.slice(0, 3),
      ...aspect.negative_descriptors.slice(0, 2).map((descriptor) => `Watch: ${descriptor}`),
      aspect.confidence,
    ].filter(Boolean)

    cards.push({
      key: `legacy-${title.toLowerCase()}`,
      title,
      topic: title.toLowerCase(),
      summary: aspect.summary || `Review-backed ${title.toLowerCase()} signal.`,
      supportCount: aspect.support_count,
      recentSupportCount: aspect.recent_support_count,
      quotes: aspect.evidence_quotes.slice(0, 3),
      chips,
      contradictions: aspect.contradictions,
      namedEntities: [],
    })
  })

  if (profile.crowd.summary || profile.crowd.evidence_quotes.length > 0) {
    cards.push({
      key: 'legacy-crowd',
      title: 'Crowd fit',
      topic: 'crowd',
      summary: profile.crowd.summary || 'Review-backed crowd signal.',
      supportCount: profile.review_count,
      recentSupportCount: null,
      quotes: profile.crowd.evidence_quotes.slice(0, 3),
      chips: [...profile.crowd.group_types.slice(0, 2), ...profile.crowd.common_occasions.slice(0, 2)],
      contradictions: [],
      namedEntities: [],
    })
  }

  return cards
    .filter((card) => card.summary || card.quotes.length > 0 || card.supportCount > 0)
    .sort((left, right) => right.supportCount - left.supportCount)
}

function extractEvidenceCards(
  artifact: Review2BlogArtifactPayload | null | undefined,
): EvidenceCardData[] {
  if (!artifact) {
    return []
  }

  const phaseOutputs = artifact.phase_outputs ?? {}
  const explicitRankedClaims =
    (Array.isArray(phaseOutputs.ranked_claims) ? phaseOutputs.ranked_claims : null) ??
    (isRecord(phaseOutputs.phase2_evidence) && Array.isArray(phaseOutputs.phase2_evidence.ranked_claims)
      ? (phaseOutputs.phase2_evidence.ranked_claims as Review2BlogEvidenceClaim[])
      : null) ??
    (isRecord(phaseOutputs.phase2_profile) && Array.isArray(phaseOutputs.phase2_profile.ranked_claims)
      ? (phaseOutputs.phase2_profile.ranked_claims as Review2BlogEvidenceClaim[])
      : null) ??
    (isRecord(phaseOutputs.evidence_profile) && Array.isArray(phaseOutputs.evidence_profile.ranked_claims)
      ? (phaseOutputs.evidence_profile.ranked_claims as Review2BlogEvidenceClaim[])
      : null)

  if (explicitRankedClaims && explicitRankedClaims.length > 0) {
    return buildEvidenceCardsFromRankedClaims(explicitRankedClaims)
  }

  const phase1Claims = Array.isArray(phaseOutputs.phase1_claims)
    ? phaseOutputs.phase1_claims.filter((claim): claim is ClaimSignalV1 => isRecord(claim))
    : []

  if (phase1Claims.length > 0) {
    return buildEvidenceCardsFromClaimSignals(phase1Claims)
  }

  const legacyProfile = asLegacyProfile(phaseOutputs.phase2_profile)
  if (legacyProfile) {
    return buildEvidenceCardsFromLegacyProfile(legacyProfile)
  }

  return []
}

function extractNamedEntitySupport(
  artifact: Review2BlogArtifactPayload | null | undefined,
): Review2BlogNamedEntitySupport[] {
  if (!artifact) {
    return []
  }

  const phaseOutputs = artifact.phase_outputs ?? {}
  if (isRecord(phaseOutputs.phase2_evidence) && Array.isArray(phaseOutputs.phase2_evidence.named_entity_support)) {
    return phaseOutputs.phase2_evidence.named_entity_support as Review2BlogNamedEntitySupport[]
  }

  if (isRecord(phaseOutputs.phase2_profile) && Array.isArray(phaseOutputs.phase2_profile.named_entity_support)) {
    return phaseOutputs.phase2_profile.named_entity_support as Review2BlogNamedEntitySupport[]
  }

  if (isRecord(phaseOutputs.evidence_profile) && Array.isArray(phaseOutputs.evidence_profile.named_entity_support)) {
    return phaseOutputs.evidence_profile.named_entity_support as Review2BlogNamedEntitySupport[]
  }

  const legacyProfile = asLegacyProfile(phaseOutputs.phase2_profile)
  if (!legacyProfile) {
    return []
  }

  return legacyProfile.standout_dishes.map((dish) => ({
    name: dish.name,
    support_count: dish.support_count,
    quotes: dish.evidence_quotes.slice(0, 2),
  }))
}

function extractContradictions(
  artifact: Review2BlogArtifactPayload | null | undefined,
): string[] {
  if (!artifact) {
    return []
  }

  const phaseOutputs = artifact.phase_outputs ?? {}
  const contradictionSources = [
    isRecord(phaseOutputs.phase2_evidence) ? phaseOutputs.phase2_evidence.contradictions : null,
    isRecord(phaseOutputs.phase2_profile) ? phaseOutputs.phase2_profile.contradictions : null,
    isRecord(phaseOutputs.evidence_profile) ? phaseOutputs.evidence_profile.contradictions : null,
  ]

  for (const source of contradictionSources) {
    if (!Array.isArray(source)) {
      continue
    }

    const objectSummaries = source
      .map((entry) => {
        if (!isRecord(entry)) {
          return ''
        }

        const topic = readString(entry.topic)
        const subject = readString(entry.subject)
        const positive = typeof entry.positive_count === 'number' ? String(entry.positive_count) : ''
        const negative = typeof entry.negative_count === 'number' ? String(entry.negative_count) : ''
        if (topic && subject && positive && negative) {
          return `${toSentenceCase(topic)}: reviewers split on ${subject} (${positive} positive / ${negative} negative).`
        }
        return ''
      })
      .filter(Boolean)

    if (objectSummaries.length > 0) {
      return objectSummaries
    }

    const stringValues = readStringArray(source)
    if (stringValues.length > 0) {
      return stringValues
    }
  }

  const legacyProfile = asLegacyProfile(phaseOutputs.phase2_profile)
  return legacyProfile?.contradictions ?? []
}

function getFinalBlurb(artifact: Review2BlogArtifactPayload | null | undefined): string | null {
  const value = artifact?.phase_outputs.phase3?.blurb
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function UploadPreview({ payload }: { payload: ReviewPayload }) {
  const editorial = getReview2BlogEditorialIntent(null, payload)
  const stats = buildReviewStats(payload)
  const factSections = buildFactSections(payload, editorial)

  return (
    <section className="r2b-artifact-shell">
      <div className="r2b-artifact-header">
        <div>
          <p className="r2b-section-kicker">Preview</p>
          <h3>{payload.name}</h3>
          <p className="r2b-artifact-subtitle">
            JSON-only export detected. Only factual metadata and editorial constraints are used
            here before the run starts.
          </p>
        </div>
      </div>

      <div className="r2b-metric-grid">
        <MetricCard label="Category" value={formatCategoryLabel(payload.category)} tone="accent" />
        <MetricCard label="District" value={payload.district} />
        <MetricCard label="Reviews" value={String(stats.reviewCount)} />
        <MetricCard
          label="Average rating"
          value={stats.averageRating ? stats.averageRating.toFixed(1) : 'Not available'}
        />
        <MetricCard label="Sources" value={stats.sourceCount ? String(stats.sourceCount) : 'Not available'} />
        <MetricCard label="Review window" value={formatDateRange(stats.earliestDate, stats.latestDate)} />
      </div>

      <div className="r2b-profile-grid">
        {factSections.map((section) => (
          <FactSectionCard key={section.title} section={section} />
        ))}
      </div>
    </section>
  )
}

type MetricCardProps = {
  label: string
  value: string
  tone?: 'default' | 'accent'
}

function MetricCard({ label, value, tone = 'default' }: MetricCardProps) {
  return (
    <div className={`r2b-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FactSectionCard({ section }: { section: FactSection }) {
  return (
    <article className="r2b-profile-card">
      <div className="r2b-profile-card-header">
        <h4>{section.title}</h4>
        <span>{section.items.length} facts</span>
      </div>
      <dl className="r2b-meta-list">
        {section.items.map((item) => (
          <div key={`${section.title}-${item.label}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

type PipelineProgressProps = {
  phase1Status: PhaseStatus
  phase2Status: PhaseStatus
  phase3Status: PhaseStatus
  currentStageLabel: string
  currentStageMessage: string
  runId: string | null
}

function PipelineProgress({
  phase1Status,
  phase2Status,
  phase3Status,
  currentStageLabel,
  currentStageMessage,
  runId,
}: PipelineProgressProps) {
  const phases = [
    { num: 1, label: 'Extract category-aware claim signals', status: phase1Status },
    { num: 2, label: 'Rank repeated evidence and contradictions', status: phase2Status },
    { num: 3, label: 'Write and validate the final blurb', status: phase3Status },
  ]

  return (
    <div className="r2b-pipeline-progress-centered">
      <div className="r2b-progress-meta">
        <div>
          <h3>Pipeline Progress</h3>
          <p className="r2b-progress-stage-label">{currentStageLabel}</p>
          <p className="r2b-progress-stage-copy">{currentStageMessage}</p>
        </div>
        {runId ? <span className="r2b-inline-pill">Run {runId}</span> : null}
      </div>
      <div className="r2b-stage-checklist">
        {phases.map((phase) => (
          <div key={phase.num} className={`r2b-stage-item ${phase.status}`}>
            <div className="r2b-stage-dot" />
            <span>
              Phase {phase.num}: {phase.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type EvidencePanelProps = {
  previewSource: Record<string, unknown> | null
  editorial: EditorialIntentV1 | null
  phase1Summary: Review2BlogPhase1Summary | null | undefined
  legacyProfile: RestaurantProfileV2 | null
  evidenceCards: EvidenceCardData[]
  namedEntitySupport: Review2BlogNamedEntitySupport[]
  contradictions: string[]
  traceUrl: string | null
  reviewStats: ReviewStats
}

function EvidencePanel({
  previewSource,
  editorial,
  phase1Summary,
  legacyProfile,
  evidenceCards,
  namedEntitySupport,
  contradictions,
  traceUrl,
  reviewStats,
}: EvidencePanelProps) {
  const factSections = buildFactSections(previewSource, editorial)

  const reviewWindow = legacyProfile
    ? formatDateRange(legacyProfile.date_range.earliest, legacyProfile.date_range.latest)
    : formatDateRange(reviewStats.earliestDate, reviewStats.latestDate)

  const averageRating = legacyProfile
    ? legacyProfile.average_rating.toFixed(1)
    : reviewStats.averageRating
      ? reviewStats.averageRating.toFixed(1)
      : 'Not available'

  const reviewCount = legacyProfile?.review_count ?? reviewStats.reviewCount

  return (
    <section className="r2b-artifact-shell">
      <div className="r2b-artifact-header">
        <div>
          <p className="r2b-section-kicker">Evidence first</p>
          <h3>Review-backed evidence snapshot</h3>
          <p className="r2b-artifact-subtitle">
            The strongest repeated claims and factual constraints are shown before the final blurb.
          </p>
        </div>
        <div className="r2b-link-row">
          {traceUrl ? (
            <a className="review2blog-nav-link" href={traceUrl} target="_blank" rel="noreferrer">
              Open Trace
            </a>
          ) : null}
        </div>
      </div>

      <div className="r2b-metric-grid">
        <MetricCard
          label="Category"
          value={formatCategoryLabel(readString(previewSource?.category))}
          tone="accent"
        />
        <MetricCard label="Reviews" value={String(reviewCount)} />
        <MetricCard label="Average rating" value={averageRating} />
        <MetricCard label="Review window" value={reviewWindow} />
        <MetricCard label="Phase 1 mode" value={formatBatchMode(phase1Summary)} />
        <MetricCard label="Claims shown" value={String(evidenceCards.length)} />
      </div>

      {factSections.length > 0 ? (
        <div className="r2b-profile-grid">
          {factSections.map((section) => (
            <FactSectionCard key={`facts-${section.title}`} section={section} />
          ))}
        </div>
      ) : null}

      {evidenceCards.length > 0 ? (
        <div className="r2b-profile-grid">
          {evidenceCards.map((card) => (
            <article key={card.key} className="r2b-profile-card">
              <div className="r2b-profile-card-header">
                <h4>{card.title}</h4>
                <span>
                  {card.supportCount} support
                  {card.recentSupportCount !== null ? ` · ${card.recentSupportCount} recent` : ''}
                </span>
              </div>
              <p className="r2b-profile-summary">{card.summary}</p>
              {card.chips.length > 0 ? (
                <div className="r2b-chip-list">
                  {card.chips.map((chip) => (
                    <span key={`${card.key}-${chip}`} className="r2b-chip">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
              {card.quotes.length > 0 ? (
                <ul className="r2b-quote-list">
                  {card.quotes.map((quote) => (
                    <li key={`${card.key}-${quote}`}>{quote}</li>
                  ))}
                </ul>
              ) : (
                <p className="r2b-empty-text">No supporting quotes returned for this claim.</p>
              )}
              {card.namedEntities.length > 0 ? (
                <div className="r2b-chip-list">
                  {card.namedEntities.map((entity) => (
                    <span key={`${card.key}-entity-${entity}`} className="r2b-chip">
                      {entity}
                    </span>
                  ))}
                </div>
              ) : null}
              {card.contradictions.length > 0 ? (
                <ul className="r2b-contradiction-list">
                  {card.contradictions.map((item) => (
                    <li key={`${card.key}-contra-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="r2b-profile-card">
          <h4>Evidence is still building</h4>
          <p className="r2b-empty-text">
            Once phase 2 finishes, this view will prioritize ranked claims and supporting quotes
            before the final copy.
          </p>
        </div>
      )}

      {namedEntitySupport.length > 0 ? (
        <article className="r2b-profile-card">
          <div className="r2b-profile-card-header">
            <h4>Named entities with support</h4>
            <span>{namedEntitySupport.length} entities</span>
          </div>
          <ul className="r2b-dish-list">
            {namedEntitySupport.map((entity) => (
              <li key={entity.name}>
                <strong>{entity.name}</strong>
                <span>{entity.support_count} supported mentions</span>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {contradictions.length > 0 ? (
        <article className="r2b-profile-card">
          <div className="r2b-profile-card-header">
            <h4>Contradictions</h4>
            <span>{contradictions.length} conflicts</span>
          </div>
          <ul className="r2b-contradiction-list">
            {contradictions.map((contradiction) => (
              <li key={contradiction}>{contradiction}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  )
}

type OutputPanelProps = {
  finalBlurb: string | null
  finalMarkdown: string | null
  clipboardMessage: string | null
  onCopy: (text: string, successMessage: string) => void
  onStartOver: () => void
}

function OutputPanel({
  finalBlurb,
  finalMarkdown,
  clipboardMessage,
  onCopy,
  onStartOver,
}: OutputPanelProps) {
  if (!finalBlurb && !finalMarkdown) {
    return null
  }

  return (
    <section className="r2b-artifact-shell">
      <div className="r2b-artifact-header">
        <div>
          <p className="r2b-section-kicker">Output</p>
          <h3>Final category-aware blurb</h3>
          <p className="r2b-artifact-subtitle">
            The copy appears after the evidence so weak paraphrasing is easier to spot.
          </p>
        </div>
      </div>

      {finalBlurb ? <div className="r2b-final-blurb">{finalBlurb}</div> : null}

      {finalMarkdown ? (
        <div>
          <p className="r2b-subheading">Markdown export</p>
          <pre className="r2b-markdown-output">{finalMarkdown}</pre>
        </div>
      ) : null}

      {clipboardMessage ? <p className="r2b-status-line">{clipboardMessage}</p> : null}

      <div className="review2blog-button-row">
        {finalBlurb ? (
          <button
            type="button"
            className="review2blog-submit-btn"
            onClick={() => onCopy(finalBlurb, 'Final blurb copied to clipboard.')}
          >
            Copy blurb
          </button>
        ) : null}
        {finalMarkdown ? (
          <button
            type="button"
            className="review2blog-submit-btn"
            onClick={() => onCopy(finalMarkdown, 'Markdown copied to clipboard.')}
          >
            Copy markdown
          </button>
        ) : null}
        <button type="button" className="review2blog-clear-btn" onClick={onStartOver}>
          Start Over
        </button>
      </div>
    </section>
  )
}

type LegacyResumePanelProps = {
  config: ListicleConfig
  onChange: (next: ListicleConfig) => void
  onResume: () => void
  pending: boolean
  errorMessage: string | null
  onStartOver: () => void
}

function LegacyResumePanel({
  config,
  onChange,
  onResume,
  pending,
  errorMessage,
  onStartOver,
}: LegacyResumePanelProps) {
  return (
    <section className="r2b-artifact-shell">
      <div className="r2b-artifact-header">
        <div>
          <p className="r2b-section-kicker">Legacy recovery</p>
          <h3>Resume an older paused run</h3>
          <p className="r2b-artifact-subtitle">
            The new JSON-only flow does not ask for separate listicle fields up front. This form is
            kept only to recover older paused runs.
          </p>
        </div>
      </div>

      <div className="review2blog-panel-body">
        <div className="review2blog-json-input">
          <label htmlFor="legacy-listicle-type">Listicle type</label>
          <input
            id="legacy-listicle-type"
            type="text"
            value={config.listicle_type}
            onChange={(event) =>
              onChange({
                ...config,
                listicle_type: event.target.value,
              })
            }
            className="review2blog-json-textarea r2b-text-input"
          />
        </div>
        <div className="review2blog-json-input">
          <label htmlFor="legacy-listicle-title">Listicle title</label>
          <input
            id="legacy-listicle-title"
            type="text"
            value={config.listicle_title}
            onChange={(event) =>
              onChange({
                ...config,
                listicle_title: event.target.value,
              })
            }
            className="review2blog-json-textarea r2b-text-input"
          />
        </div>
        <div className="review2blog-json-input">
          <label htmlFor="legacy-listicle-goal">Listicle goal</label>
          <textarea
            id="legacy-listicle-goal"
            rows={4}
            value={config.listicle_goal}
            onChange={(event) =>
              onChange({
                ...config,
                listicle_goal: event.target.value,
              })
            }
            className="review2blog-json-textarea"
          />
        </div>

        {errorMessage ? <p className="review2blog-error">{errorMessage}</p> : null}

        <div className="review2blog-button-row">
          <button
            type="button"
            className="review2blog-submit-btn"
            disabled={!isLegacyResumeValid(config) || pending}
            onClick={onResume}
          >
            {pending ? 'Resuming legacy run...' : 'Resume legacy run'}
          </button>
          <button type="button" className="review2blog-clear-btn" onClick={onStartOver}>
            Start Over
          </button>
        </div>
      </div>
    </section>
  )
}

export default function Review2BlogPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const [fileParseError, setFileParseError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)
  const [legacyListicleConfig, setLegacyListicleConfig] = useState<ListicleConfig>(
    createEmptyLegacyListicle(),
  )

  const clearTransientMessages = () => {
    setFileParseError(null)
    setClipboardMessage(null)
  }

  const resetRunState = () => {
    setRunId(null)
    setClipboardMessage(null)
    setLegacyListicleConfig(createEmptyLegacyListicle())
    startRunMutation.reset()
    resumeMutation.reset()
  }

  const startRunMutation = useMutation({
    mutationFn: startReview2BlogRun,
    onMutate: () => {
      clearTransientMessages()
      resumeMutation.reset()
    },
    onSuccess: (data) => {
      setRunId(data.run_id)
    },
  })

  const resumeMutation = useMutation({
    mutationFn: ({ nextRunId, request }: { nextRunId: string; request: { listicle: ListicleConfig } }) =>
      resumeReview2BlogRun(nextRunId, request),
    onMutate: () => {
      setClipboardMessage(null)
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['review2blog', 'status', variables.nextRunId] })
      await queryClient.invalidateQueries({ queryKey: ['review2blog', 'result', variables.nextRunId] })
    },
  })

  const statusQuery = useQuery({
    queryKey: ['review2blog', 'status', runId],
    queryFn: () => getReview2BlogStatus(runId as string),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const current = query.state.data as Review2BlogStatusResponse | undefined
      if (!current) {
        return 1000
      }

      return current.state === 'completed' || current.state === 'failed' || current.state === 'awaiting_input'
        ? false
        : 1000
    },
  })

  const resultQuery = useQuery({
    queryKey: ['review2blog', 'result', runId],
    queryFn: () => getReview2BlogResult(runId as string),
    enabled: Boolean(runId) && (statusQuery.data?.state === 'awaiting_input' || statusQuery.data?.state === 'completed'),
    staleTime: 0,
  })

  const artifact = useMemo(() => getReview2BlogArtifact(resultQuery.data), [resultQuery.data])
  const traceUrl = useMemo(() => getReview2BlogTraceUrl(resultQuery.data), [resultQuery.data])
  const locationContext = useMemo(
    () => getReview2BlogLocationContext(artifact, reviewPayload),
    [artifact, reviewPayload],
  )
  const editorialIntent = useMemo(
    () => getReview2BlogEditorialIntent(artifact, reviewPayload),
    [artifact, reviewPayload],
  )
  const previewSource = useMemo<Record<string, unknown> | null>(() => {
    if (reviewPayload) {
      return reviewPayload
    }

    if (locationContext && isRecord(locationContext)) {
      return {
        ...locationContext,
        editorial: editorialIntent ?? undefined,
      }
    }

    return null
  }, [editorialIntent, locationContext, reviewPayload])
  const phase1Summary = artifact?.phase_outputs.phase1_summary
  const legacyProfile = asLegacyProfile(artifact?.phase_outputs.phase2_profile)
  const evidenceCards = useMemo(() => extractEvidenceCards(artifact), [artifact])
  const namedEntitySupport = useMemo(() => extractNamedEntitySupport(artifact), [artifact])
  const contradictions = useMemo(() => extractContradictions(artifact), [artifact])
  const finalBlurb = getFinalBlurb(artifact)
  const finalMarkdown = resultQuery.data?.markdown ?? null
  const reviewStats = useMemo(() => buildReviewStats(reviewPayload), [reviewPayload])

  useEffect(() => {
    if (!artifact?.listicle) {
      return
    }

    setLegacyListicleConfig((current) => {
      if (current.listicle_type || current.listicle_title || current.listicle_goal) {
        return current
      }

      return {
        listicle_type: readString(artifact.listicle?.listicle_type),
        listicle_title: readString(artifact.listicle?.listicle_title),
        listicle_goal: readString(artifact.listicle?.listicle_goal),
      }
    })
  }, [artifact])

  const hasRunStarted = startRunMutation.isPending || Boolean(runId)
  const currentStep = getWizardStep({
    hasRunStarted,
    startPending: startRunMutation.isPending,
    status: statusQuery.data,
    result: resultQuery.data,
  })

  const { phase1Status, phase2Status, phase3Status } = useMemo(
    () => getPhaseStatuses(statusQuery.data, hasRunStarted),
    [statusQuery.data, hasRunStarted],
  )

  const currentStage = statusQuery.data?.stage ?? 'queued'
  const currentStageMeta = REVIEW2BLOG_STAGE_META[currentStage]
  const primaryError =
    fileParseError ||
    (startRunMutation.error instanceof Error ? startRunMutation.error.message : null) ||
    (resumeMutation.error instanceof Error ? resumeMutation.error.message : null) ||
    (resultQuery.error instanceof Error ? resultQuery.error.message : null) ||
    buildStageFailureMessage(statusQuery.data)

  const loadFile = async (file: File) => {
    setSelectedFile(file)
    setReviewPayload(null)
    setIsParsingFile(true)
    setIsDragOver(false)
    clearTransientMessages()
    resetRunState()

    try {
      const parsed = await parseReviewJsonFile(file)
      setReviewPayload(parsed)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse JSON file.'
      setFileParseError(message)
    } finally {
      setIsParsingFile(false)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!reviewPayload) {
      setFileParseError('Choose a valid exported JSON file before starting the run.')
      return
    }

    startRunMutation.mutate({ review_payload: reviewPayload })
  }

  const handleResume = () => {
    if (!runId || !isLegacyResumeValid(legacyListicleConfig)) {
      return
    }

    resumeMutation.mutate({
      nextRunId: runId,
      request: {
        listicle: legacyListicleConfig,
      },
    })
  }

  const handleStartOver = () => {
    setSelectedFile(null)
    setReviewPayload(null)
    setIsDragOver(false)
    setIsParsingFile(false)
    setFileParseError(null)
    setRunId(null)
    setLegacyListicleConfig(createEmptyLegacyListicle())
    setClipboardMessage(null)
    startRunMutation.reset()
    resumeMutation.reset()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCopy = async (text: string, successMessage: string) => {
    try {
      await copyToClipboard(text)
      setClipboardMessage(successMessage)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy to clipboard.'
      setClipboardMessage(message)
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)

    const file = Array.from(event.dataTransfer.files).find(
      (candidate) =>
        candidate.type === 'application/json' || candidate.name.toLowerCase().endsWith('.json'),
    )

    if (file) {
      void loadFile(file)
    } else {
      setFileParseError('Drop a JSON file to continue.')
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void loadFile(file)
    }
  }

  return (
    <div className="review2blog-page">
      <header className="review2blog-hero">
        <div>
          <p className="review2blog-eyebrow">Questurian Studio</p>
          <h1>
            Turn one exported JSON file into{' '}
            <span className="review2blog-underline-text">review-backed location blurbs</span>
            <span className="review2blog-green-dot">.</span>
          </h1>
          <p className="review2blog-lede">
            Upload a Location Manager export, preview the category facts, and let Review2Blog run
            from the review corpus instead of rewriting neighborhood copy or listicle fields.
          </p>
        </div>
        <div className="review2blog-badge-row">
          <span className="review2blog-badge">JSON-only input</span>
          <span className="review2blog-badge">5 supported location categories</span>
          <span className="review2blog-badge">Evidence-first results</span>
          <Link to="/" className="review2blog-nav-link">
            ← Home
          </Link>
        </div>
      </header>

      <main className="review2blog-wizard">
        {currentStep === 'upload' ? (
          <section className="review2blog-panel r2b-wizard-panel r2b-wizard-panel-wide">
            <div className="review2blog-panel-header">
              <h2>Upload exported JSON</h2>
              <p>
                Choose one exported Location Manager JSON file. The client validates the category,
                editorial block, and normalized reviews locally, then sends only{' '}
                <strong>review_payload</strong> to <strong>/review2blog/run</strong>.
              </p>
            </div>

            <form className="review2blog-panel-body" onSubmit={handleSubmit}>
              <div
                className={`review2blog-file-input ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  id="review-json-input"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                />
                {selectedFile ? (
                  <div className="r2b-file-preview">
                    <span>{selectedFile.name}</span>
                    <p className="r2b-file-meta">
                      {isParsingFile
                        ? 'Parsing export and validating schema...'
                        : `${reviewStats.reviewCount} reviews detected`}
                    </p>
                  </div>
                ) : (
                  <span>{isDragOver ? 'Drop JSON file here' : 'Choose an exported JSON file or drag and drop'}</span>
                )}
              </div>

              {primaryError ? <p className="review2blog-error">{primaryError}</p> : null}

              <div className="review2blog-button-row">
                <button
                  type="submit"
                  className="review2blog-submit-btn"
                  disabled={!reviewPayload || isParsingFile || startRunMutation.isPending}
                >
                  {startRunMutation.isPending ? 'Starting run...' : 'Start Review2Blog run'}
                </button>
                {(selectedFile || reviewPayload) && (
                  <button type="button" className="review2blog-clear-btn" onClick={handleStartOver}>
                    Clear
                  </button>
                )}
              </div>
            </form>

            {reviewPayload ? <UploadPreview payload={reviewPayload} /> : null}
          </section>
        ) : (
          <section className="review2blog-panel r2b-wizard-panel r2b-wizard-panel-wide">
            <div className="review2blog-panel-body r2b-panel-stack">
              <PipelineProgress
                phase1Status={phase1Status}
                phase2Status={phase2Status}
                phase3Status={phase3Status}
                currentStageLabel={currentStageMeta.label}
                currentStageMessage={currentStageMeta.message}
                runId={runId}
              />

              {currentStep === 'processing' ? (
                <section className="r2b-artifact-shell">
                  <div className="r2b-artifact-header">
                    <div>
                      <p className="r2b-section-kicker">Run status</p>
                      <h3>Run in progress</h3>
                      <p className="r2b-artifact-subtitle">{currentStageMeta.message}</p>
                    </div>
                  </div>
                  {primaryError ? <p className="review2blog-error">{primaryError}</p> : null}
                </section>
              ) : null}

              {previewSource ? (
                <EvidencePanel
                  previewSource={previewSource}
                  editorial={editorialIntent}
                  phase1Summary={phase1Summary}
                  legacyProfile={legacyProfile}
                  evidenceCards={evidenceCards}
                  namedEntitySupport={namedEntitySupport}
                  contradictions={contradictions}
                  traceUrl={traceUrl}
                  reviewStats={reviewStats}
                />
              ) : null}

              {currentStep === 'awaiting-input' ? (
                <LegacyResumePanel
                  config={legacyListicleConfig}
                  onChange={setLegacyListicleConfig}
                  onResume={handleResume}
                  pending={resumeMutation.isPending}
                  errorMessage={primaryError}
                  onStartOver={handleStartOver}
                />
              ) : null}

              {currentStep === 'complete' ? (
                <OutputPanel
                  finalBlurb={finalBlurb}
                  finalMarkdown={finalMarkdown}
                  clipboardMessage={clipboardMessage}
                  onCopy={(text, message) => {
                    void handleCopy(text, message)
                  }}
                  onStartOver={handleStartOver}
                />
              ) : null}

              {currentStep === 'failed' ? (
                <section className="r2b-artifact-shell">
                  <div className="r2b-artifact-header">
                    <div>
                      <p className="r2b-section-kicker">Run status</p>
                      <h3>Run failed</h3>
                      <p className="r2b-artifact-subtitle">{buildStageFailureMessage(statusQuery.data)}</p>
                    </div>
                  </div>
                  <div className="review2blog-button-row">
                    <button type="button" className="review2blog-clear-btn" onClick={handleStartOver}>
                      Start Over
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest

  describe('getPhaseStatuses', () => {
    it('marks phase 1 and phase 2 as done while awaiting legacy input', () => {
      const statuses = getPhaseStatuses(
        {
          run_id: 'run-1',
          feature: 'review2blog',
          state: 'awaiting_input',
          stage: 'awaiting_listicle',
          error: null,
          updated_at: '2026-03-06T12:00:00Z',
        },
        true,
      )

      expect(statuses).toEqual({
        phase1Status: 'done',
        phase2Status: 'done',
        phase3Status: 'pending',
      })
    })
  })

  describe('buildFactSections', () => {
    it('extracts category-specific nightlife facts and editorial constraints', () => {
      const sections = buildFactSections(
        {
          category: 'nightlife',
          type: 'Cocktail Bar',
          district: 'Barranco',
          locationKey: 'peru|lima|barranco',
          nightlifeDetails: {
            price_tier: '$$$',
            music: ['house'],
            details: {
              theSpace: {
                venueType: { value: 'rooftop' },
              },
              theScene: {
                energyLevel: { value: 'high' },
              },
            },
          },
        },
        {
          placement_type: 'best bars',
          selection_angle: 'late-night cocktails',
          audience: 'travelers',
          tone: 'grounded',
          must_mention: ['views'],
          avoid: ['luxury'],
        },
      )

      expect(sections.find((section) => section.title === 'Category facts')?.items).toEqual(
        expect.arrayContaining([
          { label: 'Price tier', value: '$$$' },
          { label: 'Music', value: 'house' },
          { label: 'Venue type', value: 'rooftop' },
        ]),
      )
      expect(sections.find((section) => section.title === 'Editorial constraints')?.items).toEqual(
        expect.arrayContaining([{ label: 'Selection angle', value: 'late-night cocktails' }]),
      )
    })
  })

  describe('extractEvidenceCards', () => {
    it('prefers ranked evidence claims when present', () => {
      const cards = extractEvidenceCards({
        run_id: 'run-ranked',
        phase_outputs: {
          ranked_claims: [
            {
              topic: 'music',
              subject: 'house-heavy soundtrack',
              support_count: 4,
              recent_support_count: 2,
              quotes: ['Great house set all night'],
              contradictions: [],
              named_entities: [],
              polarity: 'positive',
              confidence: 'high',
            },
          ],
        },
      } as Review2BlogArtifactPayload)

      expect(cards[0]).toMatchObject({
        title: 'house-heavy soundtrack',
        supportCount: 4,
        topic: 'music',
      })
    })

    it('falls back to legacy standout dishes when only the old profile exists', () => {
      const cards = extractEvidenceCards({
        run_id: 'run-legacy',
        phase_outputs: {
          phase2_profile: {
            review_count: 12,
            average_rating: 4.5,
            date_range: {
              earliest: '2025-01-01',
              latest: '2025-02-01',
            },
            overall_vibe: 'Warm and lively',
            overall_confidence: 'high',
            contradictions: [],
            editorial_hooks: [],
            standout_dishes: [
              {
                name: 'ceviche',
                positive_count: 5,
                negative_count: 0,
                support_count: 5,
                recent_support_count: 3,
                evidence_quotes: ['The ceviche was outstanding'],
              },
            ],
            food: {
              summary: 'Food lands well',
              confidence: 'high',
              support_count: 8,
              recent_support_count: 4,
              positive_descriptors: ['fresh'],
              negative_descriptors: [],
              evidence_quotes: [],
              contradictions: [],
            },
            service: {
              summary: 'Service feels warm',
              confidence: 'medium',
              support_count: 6,
              recent_support_count: 3,
              positive_descriptors: [],
              negative_descriptors: [],
              evidence_quotes: [],
              contradictions: [],
              reliability: 'high',
              energy: 'warm',
            },
            atmosphere: {
              summary: 'Busy room',
              confidence: 'medium',
              support_count: 5,
              recent_support_count: 2,
              positive_descriptors: [],
              negative_descriptors: [],
              evidence_quotes: [],
              contradictions: [],
              noise_level: 'moderate',
              best_for: [],
            },
            location: {
              summary: 'Easy to find',
              confidence: 'low',
              support_count: 2,
              recent_support_count: 1,
              positive_descriptors: [],
              negative_descriptors: [],
              evidence_quotes: [],
              contradictions: [],
            },
            value: {
              summary: 'Fair for the area',
              confidence: 'medium',
              support_count: 3,
              recent_support_count: 1,
              positive_descriptors: [],
              negative_descriptors: [],
              evidence_quotes: [],
              contradictions: [],
              perception: 'good',
            },
            crowd: {
              summary: '',
              confidence: 'low',
              group_types: [],
              common_occasions: [],
              evidence_quotes: [],
            },
          },
        },
      } as Review2BlogArtifactPayload)

      expect(cards.some((card) => card.title === 'ceviche')).toBe(true)
    })
  })

  describe('buildStageFailureMessage', () => {
    it('builds a stage-specific failure message', () => {
      expect(
        buildStageFailureMessage({
          run_id: 'run-3',
          feature: 'review2blog',
          state: 'failed',
          stage: 'stage_phase3',
          error: 'validation rewrite failed',
          updated_at: '2026-03-06T12:00:00Z',
        }),
      ).toBe('Phase 3: Category writer failed: validation rewrite failed')
    })
  })
}
