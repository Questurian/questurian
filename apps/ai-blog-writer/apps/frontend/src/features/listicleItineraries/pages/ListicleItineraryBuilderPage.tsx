import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../providers/AuthProvider'
import { MarkdownBlockEditor } from '../../staging/features/markdown-editor'
import { getLocationScopeForKey, isLocationWithinScope } from '../../locationScope/scope'
import {
  createItinerary,
  createSeoMetadata,
  fetchItineraryById,
  fetchLocations,
  fetchMediaAssets,
  fetchRelatedItems,
  fetchSeoMetadata,
  fetchSeoMetadataById,
  markdownToLexical,
  updateItinerary,
  updateSeoMetadata,
} from '../api'
import {
  createEmptyDraft,
  findDraftByDraftId,
  findDraftByPayloadId,
  removeDraft,
  saveDraft,
} from '../storage'
import { computeItemWindows, durationToMinutes, formatMinutes, fromMinutesToClock, toMinutesFromMidnight } from '../time'
import type {
  DayAudience,
  DurationMinute,
  ItineraryBlockType,
  ItineraryItemBlock,
  Meridiem,
  PayloadItineraryDoc,
  QuarterMinute,
  RelatedItemOption,
  SeoMetadataForm,
  SeoMetadataOption,
  ListicleItineraryDraft,
} from '../types'
import '../styles.css'

const DAY_AUDIENCE_OPTIONS: Array<{ label: string; value: DayAudience }> = [
  { label: 'Any Day', value: 'anyday' },
  { label: 'Weekday', value: 'weekday' },
  { label: 'Weekend', value: 'weekend' },
]

const BLOCK_TYPE_OPTIONS: Array<{ label: string; value: ItineraryBlockType }> = [
  { label: 'Dining Stop (restaurants, cafes)', value: 'itinerary-dining' },
  { label: 'Accommodation Stop (hotel check-in, stay)', value: 'itinerary-accommodations' },
  { label: 'Attraction Stop (landmarks, activities)', value: 'itinerary-attractions' },
  { label: 'Nightlife Stop (bars, clubs, evening)', value: 'itinerary-nightlife' },
  { label: 'Key Location Stop (areas, transit hubs)', value: 'itinerary-key-location' },
]

const QUARTER_MINUTE_OPTIONS: QuarterMinute[] = ['00', '15', '30', '45']
const DURATION_MINUTE_OPTIONS: DurationMinute[] = ['0', '15', '30', '45']
const PERIOD_OPTIONS: Meridiem[] = ['AM', 'PM']

function getRelationshipId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

function normalizeQuarterMinute(value: unknown): QuarterMinute {
  if (value === '00' || value === '15' || value === '30' || value === '45') return value
  return '00'
}

function normalizeDurationMinute(value: unknown): DurationMinute {
  if (value === '0' || value === '15' || value === '30' || value === '45') return value
  return '0'
}

function normalizePeriod(value: unknown): Meridiem {
  if (value === 'AM' || value === 'PM') return value
  return 'AM'
}

function payloadDocToDraft(doc: PayloadItineraryDoc, existingDraftId?: string): ListicleItineraryDraft {
  const items: ItineraryItemBlock[] = (doc.items || []).map((item, index) => ({
    id: item.id || `item_${Date.now()}_${index}`,
    blockType: item.blockType || 'itinerary-dining',
    item: getRelationshipId(item.item),
    timeHour: typeof item.timeHour === 'number' ? item.timeHour : 9,
    timeMinute: normalizeQuarterMinute(item.timeMinute),
    timePeriod: normalizePeriod(item.timePeriod),
    durationHours: typeof item.durationHours === 'number' ? item.durationHours : 1,
    durationMinutes: normalizeDurationMinute(item.durationMinutes),
    blurbMarkdown: '',
    blurbLexical: item.blurb,
    blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
  }))

  return {
    draftId: existingDraftId || `lit_payload_${doc.id}`,
    payloadId: doc.id,
    title: doc.title || '',
    location: doc.location || '',
    locationRef: getRelationshipId(doc.locationRef),
    dayAudience: doc.dayAudience || '',
    itineraryStartHour: typeof doc.itineraryStartHour === 'number' ? doc.itineraryStartHour : 9,
    itineraryStartMinute: normalizeQuarterMinute(doc.itineraryStartMinute),
    itineraryStartPeriod: normalizePeriod(doc.itineraryStartPeriod),
    itineraryEndHour: typeof doc.itineraryEndHour === 'number' ? doc.itineraryEndHour : 6,
    itineraryEndMinute: normalizeQuarterMinute(doc.itineraryEndMinute),
    itineraryEndPeriod: normalizePeriod(doc.itineraryEndPeriod),
    step1_complete: Boolean(doc.step1_complete),
    in_update_mode: Boolean(doc.in_update_mode),
    header: {
      customTitle: doc.header?.customTitle || '',
      introMarkdown: '',
      introLexical: doc.header?.intro,
      introJsonText: doc.header?.intro ? JSON.stringify(doc.header.intro, null, 2) : '',
      featuredImage: getRelationshipId(doc.header?.featuredImage),
    },
    items,
    seoSection: {
      seo: getRelationshipId(doc.seoSection?.seo),
    },
    status: doc.status || 'draft',
    articleType: 'listicle-itinerary',
    updatedAt: doc.updatedAt || new Date().toISOString(),
  }
}

function createEmptySeoForm(): SeoMetadataForm {
  return {
    metaTitle: '',
    metaDescription: '',
    keywords: '',
    ogTitle: '',
    ogDescription: '',
    ogImage: null,
    canonicalUrl: '',
    noIndex: false,
    noFollow: false,
    status: 'draft',
  }
}

function normalizeSeoPayload(form: SeoMetadataForm): SeoMetadataForm {
  const normalizeText = (value: string): string => value.trim()
  const metaDescription = normalizeText(form.metaDescription)

  return {
    ...form,
    metaTitle: normalizeText(form.metaTitle),
    metaDescription: metaDescription.length >= 50 ? metaDescription : '',
    keywords: normalizeText(form.keywords),
    ogTitle: normalizeText(form.ogTitle),
    ogDescription: normalizeText(form.ogDescription),
    canonicalUrl: normalizeText(form.canonicalUrl),
  }
}

function readLexicalFromJsonText(value: string, fieldLabel: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} JSON must be an object`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    throw new Error(err instanceof Error ? `${fieldLabel}: ${err.message}` : `${fieldLabel}: invalid JSON`)
  }
}

function validateStep1(current: ListicleItineraryDraft): string[] {
  const issues: string[] = []
  if (!current.title.trim()) issues.push('Title is required')
  if (!current.location.trim()) issues.push('Location is required')
  if (!current.dayAudience) issues.push('Day type is required')

  try {
    toMinutesFromMidnight(current.itineraryStartHour, current.itineraryStartMinute, current.itineraryStartPeriod)
  } catch (err) {
    issues.push(err instanceof Error ? err.message : 'Invalid itinerary start time')
  }

  return issues
}

export default function ListicleItineraryBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')

  const [draft, setDraft] = useState<ListicleItineraryDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const [locations, setLocations] = useState<Array<{ id: number; locationKey: string }>>([])
  const [mediaAssets, setMediaAssets] = useState<Array<{ id: number; filename: string }>>([])
  const [relatedByBlockType, setRelatedByBlockType] = useState<Record<ItineraryBlockType, RelatedItemOption[]>>({
    'itinerary-dining': [],
    'itinerary-accommodations': [],
    'itinerary-attractions': [],
    'itinerary-nightlife': [],
    'itinerary-key-location': [],
  })
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)
  const [setupBaseline, setSetupBaseline] = useState<{ location: string } | null>(null)

  const [seoOptions, setSeoOptions] = useState<SeoMetadataOption[]>([])
  const [seoModalOpen, setSeoModalOpen] = useState(false)
  const [seoModalMode, setSeoModalMode] = useState<'create' | 'edit'>('create')
  const [seoForm, setSeoForm] = useState<SeoMetadataForm>(createEmptySeoForm())
  const [isSeoSaving, setIsSeoSaving] = useState(false)

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const [locationDocs, mediaDocs, seoDocs] = await Promise.all([
          fetchLocations(token),
          fetchMediaAssets(token),
          fetchSeoMetadata(token),
        ])

        if (cancelled) return
        setLocations(locationDocs)
        setMediaAssets(mediaDocs)
        setSeoOptions(seoDocs)

        const payloadId = payloadIdParam ? Number(payloadIdParam) : null
        if (payloadId && Number.isFinite(payloadId)) {
          const localDraft = findDraftByPayloadId(payloadId)
          if (localDraft) {
            setDraft(localDraft)
          } else {
            const doc = await fetchItineraryById(payloadId, token)
            if (cancelled) return
            setDraft(payloadDocToDraft(doc))
          }
          return
        }

        if (draftIdParam) {
          const byDraftId = findDraftByDraftId(draftIdParam)
          if (byDraftId) {
            setDraft(byDraftId)
            return
          }
        }

        const fresh = createEmptyDraft()
        saveDraft(fresh)
        setDraft(fresh)
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('draftId', fresh.draftId)
            return next
          },
          { replace: true },
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to initialize builder')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [token, payloadIdParam, draftIdParam, setSearchParams])

  useEffect(() => {
    if (!draft) return

    const timer = window.setTimeout(() => {
      saveDraft(draft)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    if (!token || !draft?.location) {
      setRelatedByBlockType({
        'itinerary-dining': [],
        'itinerary-accommodations': [],
        'itinerary-attractions': [],
        'itinerary-nightlife': [],
        'itinerary-key-location': [],
      })
      return
    }

    let cancelled = false
    setIsLoadingRelated(true)

    getLocationScopeForKey(draft.location, token)
      .then((scope) => {
        if (cancelled) return []
        return Promise.all(BLOCK_TYPE_OPTIONS.map((option) => fetchRelatedItems(option.value, draft.location, token, scope)))
      })
      .then((docsByType) => {
        if (cancelled) return
        setRelatedByBlockType({
          'itinerary-dining': docsByType[0] || [],
          'itinerary-accommodations': docsByType[1] || [],
          'itinerary-attractions': docsByType[2] || [],
          'itinerary-nightlife': docsByType[3] || [],
          'itinerary-key-location': docsByType[4] || [],
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load related items')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingRelated(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, draft?.location])

  const selectedLocationRefId = useMemo(() => {
    if (!draft?.location) return null
    const selected = locations.find((location) => location.locationKey === draft.location)
    return selected?.id || null
  }, [draft?.location, locations])

  function updateDraft(next: Partial<ListicleItineraryDraft>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        ...next,
      }
    })
  }

  function updateHeader(next: Partial<ListicleItineraryDraft['header']>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        header: {
          ...current.header,
          ...next,
        },
      }
    })
  }

  function getWindowBounds(current: ListicleItineraryDraft): { start: number; end: number } | null {
    try {
      return {
        start: toMinutesFromMidnight(current.itineraryStartHour, current.itineraryStartMinute, current.itineraryStartPeriod),
        end: toMinutesFromMidnight(current.itineraryEndHour, current.itineraryEndMinute, current.itineraryEndPeriod),
      }
    } catch {
      return null
    }
  }

  function withEndAlignedToLastItem(current: ListicleItineraryDraft): ListicleItineraryDraft {
    if (!current.items.length) return current

    try {
      const windows = computeItemWindows(current.items)
      if (!windows.length) return current
      const lastEnd = windows[windows.length - 1].end
      const clock = fromMinutesToClock(lastEnd)

      return {
        ...current,
        itineraryEndHour: clock.hour,
        itineraryEndMinute: clock.minute,
        itineraryEndPeriod: clock.period,
      }
    } catch {
      return current
    }
  }

  function autoChainItems(current: ListicleItineraryDraft, startIndex = 1): ListicleItineraryDraft {
    if (!current.items.length) return current

    const items = current.items.map((item) => ({ ...item }))
    const chainStart = Math.max(1, startIndex)

    for (let i = chainStart; i < items.length; i += 1) {
      const prev = items[i - 1]
      const prevStart = toMinutesFromMidnight(prev.timeHour, prev.timeMinute, prev.timePeriod)
      const prevDuration = durationToMinutes(prev.durationHours, prev.durationMinutes)
      const nextStart = prevStart + prevDuration
      const clock = fromMinutesToClock(nextStart)

      items[i].timeHour = clock.hour
      items[i].timeMinute = clock.minute
      items[i].timePeriod = clock.period
    }

    return {
      ...current,
      items,
    }
  }

  function endHereOnLastStop() {
    setDraft((current) => {
      if (!current || current.items.length === 0) return current
      return withEndAlignedToLastItem(current)
    })
  }

  function updateItem(
    itemId: string,
    updater: (item: ItineraryItemBlock) => ItineraryItemBlock,
    options?: { cascadeSchedule?: boolean },
  ) {
    setDraft((current) => {
      if (!current) return current
      const index = current.items.findIndex((item) => item.id === itemId)
      if (index < 0) return current

      const next: ListicleItineraryDraft = {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? updater(item) : item)),
      }

      if (options?.cascadeSchedule) {
        return autoChainItems(next, index + 1)
      }

      return {
        ...next,
      }
    })
  }

  function removeItem(itemId: string) {
    setDraft((current) => {
      if (!current) return current
      const next: ListicleItineraryDraft = {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      }
      return autoChainItems(next, 1)
    })
  }

  function moveItem(itemId: string, direction: 'up' | 'down') {
    setDraft((current) => {
      if (!current) return current
      const items = [...current.items]
      const index = items.findIndex((item) => item.id === itemId)
      if (index < 0) return current
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= items.length) return current
      const [item] = items.splice(index, 1)
      items.splice(target, 0, item)
      const next: ListicleItineraryDraft = {
        ...current,
        items,
      }
      return autoChainItems(next, 1)
    })
  }

  function addItem() {
    setDraft((current) => {
      if (!current) return current
      const items = [...current.items]
      let nextStart = 9 * 60
      if (items.length > 0) {
        const prev = items[items.length - 1]
        const prevStart = toMinutesFromMidnight(prev.timeHour, prev.timeMinute, prev.timePeriod)
        const prevDuration = durationToMinutes(prev.durationHours, prev.durationMinutes)
        nextStart = prevStart + prevDuration
      } else {
        const bounds = getWindowBounds(current)
        if (bounds) nextStart = bounds.start
      }

      const clock = fromMinutesToClock(nextStart)
      const next: ListicleItineraryDraft = {
        ...current,
        items: [...items, {
          id: `item_${Date.now()}`,
          blockType: 'itinerary-dining',
          item: null,
          timeHour: clock.hour,
          timeMinute: clock.minute,
          timePeriod: clock.period,
          durationHours: 1,
          durationMinutes: '0',
          blurbMarkdown: '',
          blurbJsonText: '',
        }],
      }
      return autoChainItems(next, next.items.length - 1)
    })
  }

  function validateItemTimeline(current: ListicleItineraryDraft, targetStatus: 'draft' | 'published'): string[] {
    const issues: string[] = []
    let startWindow = 0
    try {
      startWindow = toMinutesFromMidnight(
        current.itineraryStartHour,
        current.itineraryStartMinute,
        current.itineraryStartPeriod,
      )
    } catch (err) {
      issues.push(err instanceof Error ? err.message : 'Invalid itinerary time values')
      return issues
    }

    try {
      const windows = computeItemWindows(current.items)

      for (let i = 0; i < windows.length; i += 1) {
        const item = windows[i]

        if (item.start < startWindow) {
          issues.push(
            `Item ${item.index + 1} starts at ${formatMinutes(item.start)} before itinerary start ${formatMinutes(startWindow)}`,
          )
        }

        if (i > 0) {
          const prev = windows[i - 1]
          if (item.start < prev.start) {
            issues.push(
              `Itinerary items must be in chronological order. Item ${item.index + 1} starts before item ${prev.index + 1}`,
            )
          }

          if (item.start < prev.end) {
            issues.push(
              `Time conflict: item ${item.index + 1} starts at ${formatMinutes(item.start)} before item ${prev.index + 1} ends at ${formatMinutes(prev.end)}`,
            )
          }
        }
      }

      if (targetStatus === 'published') {
        if (!windows.length) {
          issues.push('Publishing requires at least one itinerary item')
        } else {
          const first = windows[0]

          if (first.start !== startWindow) {
            issues.push(`Published itineraries must start exactly at ${formatMinutes(startWindow)}`)
          }

          for (let i = 1; i < windows.length; i += 1) {
            const prev = windows[i - 1]
            const curr = windows[i]
            if (curr.start !== prev.end) {
              issues.push(
                `Published itineraries cannot have gaps: item ${prev.index + 1} ends at ${formatMinutes(prev.end)} but item ${curr.index + 1} starts at ${formatMinutes(curr.start)}`,
              )
            }
          }
        }
      }
    } catch (err) {
      issues.push(err instanceof Error ? err.message : 'Invalid item schedule')
    }

    return issues
  }

  function handleContinue() {
    if (!draft) return
    const issues = validateStep1(draft)
    if (issues.length > 0) {
      setError(issues.join('. '))
      return
    }

    updateDraft({
      step1_complete: true,
      in_update_mode: false,
      locationRef: selectedLocationRefId,
    })
    setError(null)
  }

  function handleUpdateSetup() {
    if (!draft) return
    setSetupBaseline({
      location: draft.location,
    })
    updateDraft({ in_update_mode: true })
    setError(null)
  }

  function handleSaveSetup() {
    if (!draft) return

    const issues = validateStep1(draft)
    if (issues.length > 0) {
      setError(issues.join('. '))
      return
    }

    const locationChanged = setupBaseline?.location && setupBaseline.location !== draft.location

    if (locationChanged && draft.items.length > 0) {
      const confirmed = window.confirm('Changing location clears current itinerary items. Continue?')
      if (!confirmed) return
      updateDraft({
        items: [],
        in_update_mode: false,
        step1_complete: true,
        locationRef: selectedLocationRefId,
      })
      setSetupBaseline(null)
      return
    }

    updateDraft({
      in_update_mode: false,
      step1_complete: true,
      locationRef: selectedLocationRefId,
    })
    setSetupBaseline(null)
    setError(null)
  }

  function cancelUpdateSetup() {
    if (!draft) return
    updateDraft({ in_update_mode: false })
    setSetupBaseline(null)
    setError(null)
  }

  async function openCreateSeoModal() {
    setSeoModalMode('create')
    setSeoForm(createEmptySeoForm())
    setSeoModalOpen(true)
  }

  async function openEditSeoModal() {
    if (!token || !draft?.seoSection.seo) {
      setError('Select SEO metadata before editing')
      return
    }

    try {
      setSeoModalMode('edit')
      const loaded = await fetchSeoMetadataById(draft.seoSection.seo, token)
      setSeoForm({
        ...createEmptySeoForm(),
        ...loaded,
        id: loaded.id,
        ogImage: loaded.ogImage ?? null,
      })
      setSeoModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SEO metadata')
    }
  }

  async function handleSaveSeo() {
    if (!token) return

    try {
      setIsSeoSaving(true)
      const normalizedPayload = normalizeSeoPayload(seoForm)

      if (seoModalMode === 'create') {
        const created = await createSeoMetadata(normalizedPayload, token)
        setSeoOptions((prev) => [{ id: Number(created.id), metaTitle: created.metaTitle, status: created.status }, ...prev])
        setDraft((current) => {
          if (!current) return current
          return {
            ...current,
            seoSection: {
              seo: Number(created.id),
            },
          }
        })
      } else {
        if (!seoForm.id) throw new Error('SEO metadata id is required for update')
        const updated = await updateSeoMetadata(seoForm.id, normalizedPayload, token)
        setSeoOptions((prev) =>
          prev.map((item) =>
            item.id === Number(updated.id) ? { ...item, metaTitle: updated.metaTitle, status: updated.status } : item,
          ),
        )
      }

      setSeoModalOpen(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SEO metadata')
    } finally {
      setIsSeoSaving(false)
    }
  }

  async function submit(targetStatus: 'draft' | 'published') {
    if (!token || !draft) return

    setError(null)
    setResult(null)

    const submitDraft = withEndAlignedToLastItem(draft)

    const stepIssues = validateStep1(submitDraft)
    if (stepIssues.length > 0) {
      setError(stepIssues.join('. '))
      return
    }

    if (!selectedLocationRefId) {
      setError('Select a valid location')
      return
    }

    const timelineIssues = validateItemTimeline(submitDraft, targetStatus)
    if (timelineIssues.length > 0) {
      setError(timelineIssues[0])
      return
    }

    try {
      setIsSaving(true)

      const headerIntro = submitDraft.header.introMarkdown.trim()
        ? await markdownToLexical(submitDraft.header.introMarkdown)
        : readLexicalFromJsonText(submitDraft.header.introJsonText || '', 'Header intro')

      if (!submitDraft.header.introMarkdown.trim() && !submitDraft.header.introJsonText?.trim()) {
        throw new Error('Header intro is required (markdown or lexical JSON)')
      }

      const payloadItems = [] as Array<Record<string, unknown>>
      for (let index = 0; index < submitDraft.items.length; index += 1) {
        const item = submitDraft.items[index]
        if (!item.item) {
          throw new Error(`Item ${index + 1} is missing related entry selection`)
        }

        const relatedOptions = relatedByBlockType[item.blockType] || []
        const selectedRelated = relatedOptions.find((entry) => entry.id === item.item)
        if (
          selectedRelated?.location
          && draft.location
          && !isLocationWithinScope(selectedRelated.location, draft.location)
        ) {
          throw new Error(`Item ${index + 1} location does not match itinerary location (${submitDraft.location})`)
        }

        const blurb = item.blurbMarkdown.trim()
          ? await markdownToLexical(item.blurbMarkdown)
          : readLexicalFromJsonText(item.blurbJsonText || '', `Item ${index + 1} blurb`)

        if (!item.blurbMarkdown.trim() && !item.blurbJsonText?.trim()) {
          throw new Error(`Item ${index + 1} blurb is required (markdown or lexical JSON)`)
        }

        payloadItems.push({
          blockType: item.blockType,
          timeHour: item.timeHour,
          timeMinute: item.timeMinute,
          timePeriod: item.timePeriod,
          durationHours: item.durationHours,
          durationMinutes: item.durationMinutes,
          item: item.item,
          blurb,
        })
      }

      const body: Record<string, unknown> = {
        title: submitDraft.title.trim(),
        location: submitDraft.location,
        locationRef: selectedLocationRefId,
        dayAudience: submitDraft.dayAudience,
        itineraryStartHour: submitDraft.itineraryStartHour,
        itineraryStartMinute: submitDraft.itineraryStartMinute,
        itineraryStartPeriod: submitDraft.itineraryStartPeriod,
        itineraryEndHour: submitDraft.itineraryEndHour,
        itineraryEndMinute: submitDraft.itineraryEndMinute,
        itineraryEndPeriod: submitDraft.itineraryEndPeriod,
        step1_complete: true,
        in_update_mode: false,
        header: {
          customTitle: submitDraft.header.customTitle.trim() || undefined,
          intro: headerIntro,
          featuredImage: submitDraft.header.featuredImage || undefined,
        },
        items: payloadItems,
        seoSection: {
          seo: submitDraft.seoSection.seo || undefined,
        },
        status: targetStatus,
        articleType: 'listicle-itinerary',
      }

      const doc = draft.payloadId
        ? await updateItinerary(draft.payloadId, body, token)
        : await createItinerary(body, token)

      const nextDraft = payloadDocToDraft(doc, draft.draftId)
      nextDraft.header.introMarkdown = submitDraft.header.introMarkdown
      nextDraft.items = nextDraft.items.map((nextItem, index) => ({
        ...nextItem,
        blurbMarkdown: submitDraft.items[index]?.blurbMarkdown || '',
      }))
      setDraft(nextDraft)
      saveDraft(nextDraft)

      setResult(targetStatus === 'published' ? `Published itinerary #${doc.id}` : `Saved draft itinerary #${doc.id}`)

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('id', String(doc.id))
          next.set('draftId', nextDraft.draftId)
          return next
        },
        { replace: true },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  function handleDiscardLocalDraft() {
    if (!draft) return
    removeDraft(draft.draftId)
    if (draft.payloadId) {
      navigate(`/listicle-itineraries/builder?id=${draft.payloadId}`)
    } else {
      const fresh = createEmptyDraft()
      setDraft(fresh)
      setSearchParams({ draftId: fresh.draftId }, { replace: true })
    }
    setResult('Local staged draft discarded')
  }

  if (isLoading || !draft) {
    return (
      <div className="stl-page">
        <p className="stl-placeholder">Loading builder...</p>
      </div>
    )
  }

  const stepIssues = validateStep1(draft)
  const isSetupReady = stepIssues.length === 0

  const derivedDraft = withEndAlignedToLastItem(draft)
  let hasContinuousCoverage = false
  try {
    const windows = computeItemWindows(derivedDraft.items)
    const startWindow = toMinutesFromMidnight(derivedDraft.itineraryStartHour, derivedDraft.itineraryStartMinute, derivedDraft.itineraryStartPeriod)
    hasContinuousCoverage =
      windows.length > 0 &&
      windows[0].start === startWindow &&
      windows.every((window, index) => (index === 0 ? true : window.start === windows[index - 1].end))
  } catch {
    hasContinuousCoverage = false
  }

  const completionPercent = Math.max(
    8,
    Math.min(
      100,
      Math.round(
        ([
          draft.step1_complete ? 1 : 0,
          draft.header.featuredImage ? 1 : 0,
          (draft.header.introMarkdown || draft.header.introJsonText || '').trim() ? 1 : 0,
          draft.items.length > 0 ? 1 : 0,
          hasContinuousCoverage ? 1 : 0,
          draft.seoSection.seo ? 1 : 0,
        ].reduce((sum, value) => sum + value, 0) /
          6) *
          100,
      ),
    ),
  )

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Listicle Itinerary Builder</p>
          <h1>{draft.payloadId ? `Edit #${draft.payloadId}` : 'New Itinerary'}</h1>
          <p className="stl-lede">Field-by-field and block-by-block editor for Payload `listicle-itineraries`.</p>
        </div>
        <div className="stl-hero-actions">
          <Link to="/listicle-itineraries" className="stl-btn stl-btn-secondary">
            Back to List
          </Link>
          <button type="button" className="stl-btn stl-btn-danger" onClick={handleDiscardLocalDraft}>
            Discard Local Draft
          </button>
        </div>
      </header>

      <div className="stl-builder-layout">
        <main className="stl-builder-main">
          {error ? <p className="stl-error">{error}</p> : null}
          {result ? <p className="stl-success">{result}</p> : null}

          <section className="stl-panel">
            <div className="stl-panel-header">
              <h2>
                <span className="stl-kicker">Step 1</span> Setup
              </h2>
              <div className="stl-inline-actions">
                {!draft.step1_complete ? (
                  <button type="button" className="stl-btn" onClick={handleContinue}>
                    Continue
                  </button>
                ) : null}
                {draft.step1_complete && !draft.in_update_mode ? (
                  <button type="button" className="stl-btn stl-btn-secondary" onClick={handleUpdateSetup}>
                    Update Setup
                  </button>
                ) : null}
                {draft.in_update_mode ? (
                  <>
                    <button type="button" className="stl-btn" onClick={handleSaveSetup}>
                      Save Setup
                    </button>
                    <button type="button" className="stl-btn stl-btn-secondary" onClick={cancelUpdateSetup}>
                      Cancel
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="stl-grid stl-grid-2">
              <label className="stl-field">
                <span>Title *</span>
                <input
                  value={draft.title}
                  disabled={draft.step1_complete && !draft.in_update_mode}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                />
              </label>

              <label className="stl-field">
                <span>Location *</span>
                <select
                  value={draft.location}
                  disabled={draft.step1_complete && !draft.in_update_mode}
                  onChange={(event) => updateDraft({ location: event.target.value, locationRef: null })}
                >
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.locationKey}>
                      {location.locationKey}
                    </option>
                  ))}
                </select>
              </label>

              <label className="stl-field">
                <span>Day Type *</span>
                <select
                  value={draft.dayAudience}
                  disabled={draft.step1_complete && !draft.in_update_mode}
                  onChange={(event) => updateDraft({ dayAudience: event.target.value as DayAudience | '' })}
                >
                  <option value="">Select day type</option>
                  {DAY_AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="stl-grid stl-grid-2">
              <div className="stl-field">
                <span>Itinerary Start *</span>
                <div className="stl-grid stl-grid-3">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={draft.itineraryStartHour}
                    disabled={draft.step1_complete && !draft.in_update_mode}
                    onChange={(event) => updateDraft({ itineraryStartHour: Number(event.target.value) || 0 })}
                  />
                  <select
                    value={draft.itineraryStartMinute}
                    disabled={draft.step1_complete && !draft.in_update_mode}
                    onChange={(event) => updateDraft({ itineraryStartMinute: event.target.value as QuarterMinute })}
                  >
                    {QUARTER_MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.itineraryStartPeriod}
                    disabled={draft.step1_complete && !draft.in_update_mode}
                    onChange={(event) => updateDraft({ itineraryStartPeriod: event.target.value as Meridiem })}
                  >
                    {PERIOD_OPTIONS.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <p className="stl-summary-note">
              Total itinerary end time is derived from your last stop. Use "End Here" on the last stop to lock it now.
            </p>
          </section>

          <section className="stl-panel">
            <div className="stl-panel-header">
              <h2>
                <span className="stl-kicker">Step 2</span> Header
              </h2>
            </div>
            <div className="stl-grid stl-grid-2">
              <label className="stl-field">
                <span>Custom Title</span>
                <input value={draft.header.customTitle} onChange={(event) => updateHeader({ customTitle: event.target.value })} />
              </label>

              <label className="stl-field">
                <span>Featured Image</span>
                <select
                  value={draft.header.featuredImage || ''}
                  onChange={(event) =>
                    updateHeader({
                      featuredImage: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                >
                  <option value="">None</option>
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      #{asset.id} {asset.filename}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="stl-field">
              <span>Intro *</span>
              <MarkdownBlockEditor
                blockId={`${draft.draftId}_header_intro`}
                value={draft.header.introMarkdown}
                onChange={(nextValue) =>
                  updateHeader({
                    introMarkdown: nextValue,
                    introJsonText: '',
                  })
                }
                showToolbar
                enforceHeadingStructure={false}
                placeholder="Write the itinerary intro..."
                className="stl-markdown-textarea"
                rows={6}
              />
            </label>
            {!draft.header.introMarkdown.trim() && draft.header.introJsonText?.trim() ? (
              <p className="stl-legacy-note">
                Existing intro is stored in Payload as Lexical JSON. Editing here will replace it with markdown-converted content.
              </p>
            ) : null}
          </section>

          <section className="stl-panel">
            <div className="stl-panel-header">
              <h2>
                <span className="stl-kicker">Step 3</span> Stops & Timeline ({draft.items.length})
              </h2>
              <button type="button" className="stl-btn" onClick={addItem}>
                Add Stop
              </button>
            </div>
            <p className="stl-summary-note">
              Schedule assist: each stop chains from the previous stop.
            </p>

            {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}

            <div className="stl-list">
              {draft.items.map((item, index) => {
                const relatedOptions = relatedByBlockType[item.blockType] || []

                return (
                  <article key={item.id} className="stl-item-card">
                    <header className="stl-item-header">
                      <h3>Item {index + 1}</h3>
                      <div className="stl-inline-actions">
                        {index === draft.items.length - 1 ? (
                          <button type="button" className="stl-btn" onClick={endHereOnLastStop}>
                            End Here
                          </button>
                        ) : null}
                        <button type="button" className="stl-btn stl-btn-secondary" onClick={() => moveItem(item.id, 'up')}>
                          Up
                        </button>
                        <button
                          type="button"
                          className="stl-btn stl-btn-secondary"
                          onClick={() => moveItem(item.id, 'down')}
                        >
                          Down
                        </button>
                        <button type="button" className="stl-btn stl-btn-danger" onClick={() => removeItem(item.id)}>
                          Remove
                        </button>
                      </div>
                    </header>

                    <div className="stl-grid stl-grid-2">
                      <label className="stl-field">
                        <span>Block Type *</span>
                        <select
                          value={item.blockType}
                          onChange={(event) =>
                            updateItem(item.id, (current) => ({
                              ...current,
                              blockType: event.target.value as ItineraryBlockType,
                              item: null,
                            }))
                          }
                        >
                          {BLOCK_TYPE_OPTIONS.map((blockType) => (
                            <option key={blockType.value} value={blockType.value}>
                              {blockType.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="stl-field">
                        <span>Related Item *</span>
                        <select
                          value={item.item || ''}
                          onChange={(event) =>
                            updateItem(item.id, (current) => ({
                              ...current,
                              item: event.target.value ? Number(event.target.value) : null,
                            }))
                          }
                        >
                          <option value="">Select item</option>
                          {relatedOptions.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              #{entry.id} {entry.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="stl-grid stl-grid-2">
                      <div className="stl-field">
                        <span>Start Time * (auto-chained)</span>
                        <div className="stl-grid stl-grid-3">
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={item.timeHour}
                            onChange={(event) =>
                              updateItem(item.id, (current) => ({
                                ...current,
                                timeHour: Number(event.target.value) || 0,
                              }), { cascadeSchedule: true })
                            }
                          />
                          <select
                            value={item.timeMinute}
                            onChange={(event) =>
                              updateItem(item.id, (current) => ({
                                ...current,
                                timeMinute: event.target.value as QuarterMinute,
                              }), { cascadeSchedule: true })
                            }
                          >
                            {QUARTER_MINUTE_OPTIONS.map((minute) => (
                              <option key={minute} value={minute}>
                                {minute}
                              </option>
                            ))}
                          </select>
                          <select
                            value={item.timePeriod}
                            onChange={(event) =>
                              updateItem(item.id, (current) => ({
                                ...current,
                                timePeriod: event.target.value as Meridiem,
                              }), { cascadeSchedule: true })
                            }
                          >
                            {PERIOD_OPTIONS.map((period) => (
                              <option key={period} value={period}>
                                {period}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="stl-field">
                        <span>Duration *</span>
                        <div className="stl-grid stl-grid-2">
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={item.durationHours}
                            onChange={(event) =>
                              updateItem(item.id, (current) => ({
                                ...current,
                                durationHours: Number(event.target.value) || 0,
                              }), { cascadeSchedule: true })
                            }
                          />
                          <select
                            value={item.durationMinutes}
                            onChange={(event) =>
                              updateItem(item.id, (current) => ({
                                ...current,
                                durationMinutes: event.target.value as DurationMinute,
                              }), { cascadeSchedule: true })
                            }
                          >
                            {DURATION_MINUTE_OPTIONS.map((minute) => (
                              <option key={minute} value={minute}>
                                {minute} min
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <label className="stl-field">
                      <span>Blurb *</span>
                      <MarkdownBlockEditor
                        blockId={`${item.id}_blurb`}
                        value={item.blurbMarkdown}
                        onChange={(nextValue) =>
                          updateItem(item.id, (current) => ({
                            ...current,
                            blurbMarkdown: nextValue,
                            blurbJsonText: '',
                          }))
                        }
                        showToolbar
                        enforceHeadingStructure={false}
                        placeholder="Write editorial context for this stop..."
                        className="stl-markdown-textarea"
                        rows={5}
                      />
                    </label>
                    {!item.blurbMarkdown.trim() && item.blurbJsonText?.trim() ? (
                      <p className="stl-legacy-note">This blurb currently exists as Lexical JSON in Payload. Editing here will replace it.</p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="stl-panel">
            <div className="stl-panel-header">
              <h2>
                <span className="stl-kicker">Step 4</span> SEO & Metadata
              </h2>
              <div className="stl-inline-actions">
                <button type="button" className="stl-btn" onClick={openCreateSeoModal}>
                  Create SEO
                </button>
                <button type="button" className="stl-btn stl-btn-secondary" onClick={openEditSeoModal}>
                  Edit Selected SEO
                </button>
              </div>
            </div>

            <label className="stl-field">
              <span>SEO Metadata Relationship</span>
              <select
                value={draft.seoSection.seo || ''}
                onChange={(event) =>
                  setDraft((current) => {
                    if (!current) return current
                    return {
                      ...current,
                      seoSection: {
                        seo: event.target.value ? Number(event.target.value) : null,
                      },
                    }
                  })
                }
              >
                <option value="">None</option>
                {seoOptions.map((seo) => (
                  <option key={seo.id} value={seo.id}>
                    #{seo.id} {seo.metaTitle || '(untitled)'} [{seo.status || 'draft'}]
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="stl-panel">
            <div className="stl-panel-header">
              <h2>
                <span className="stl-kicker">Step 5</span> Publish
              </h2>
            </div>

            <div className="stl-grid stl-grid-2">
              <label className="stl-field">
                <span>Status</span>
                <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as 'draft' | 'published' })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>

              <label className="stl-field">
                <span>Article Type</span>
                <input value={draft.articleType} disabled readOnly />
              </label>
            </div>

            <div className="stl-inline-actions">
              <button type="button" className="stl-btn" onClick={() => void submit('draft')} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Draft'}
              </button>
              <button type="button" className="stl-btn stl-btn-success" onClick={() => void submit('published')} disabled={isSaving}>
                {isSaving ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </section>
        </main>

        <aside className="stl-builder-sidebar">
          <section className="stl-summary-card">
            <h3>Build Progress</h3>
            <div className="stl-progress-track" aria-hidden="true">
              <span className="stl-progress-bar" style={{ width: `${completionPercent}%` }} />
            </div>
            <p className="stl-summary-percent">{completionPercent}% ready</p>
            <ul className="stl-summary-list">
              <li className={draft.step1_complete ? 'done' : ''}>
                Setup: {draft.step1_complete ? 'Locked' : isSetupReady ? 'Ready to continue' : 'Incomplete'}
              </li>
              <li className={draft.items.length > 0 ? 'done' : ''}>Items: {draft.items.length} added</li>
              <li className={hasContinuousCoverage ? 'done' : ''}>Coverage: {hasContinuousCoverage ? 'Continuous' : 'Has gaps'}</li>
              <li className={draft.seoSection.seo ? 'done' : ''}>
                SEO relation: {draft.seoSection.seo ? `#${draft.seoSection.seo}` : 'Not selected'}
              </li>
            </ul>
          </section>

          <section className="stl-summary-card">
            <h3>Quick Actions</h3>
            <div className="stl-summary-actions">
              <button type="button" className="stl-btn" onClick={() => void submit('draft')} disabled={isSaving}>
                Save Draft
              </button>
              <button type="button" className="stl-btn stl-btn-success" onClick={() => void submit('published')} disabled={isSaving}>
                Publish
              </button>
            </div>
            <p className="stl-summary-note">Publishing requires continuous coverage from itinerary start with no gaps.</p>
            {stepIssues.length > 0 ? (
              <div className="stl-summary-warning">
                <strong>Setup needs attention:</strong>
                <p>{stepIssues[0]}</p>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {seoModalOpen ? (
        <div className="stl-modal-overlay">
          <div className="stl-modal">
            <h3>{seoModalMode === 'create' ? 'Create SEO Metadata' : 'Edit SEO Metadata'}</h3>
            <div className="stl-grid stl-grid-2">
              <label className="stl-field">
                <span>Meta Title</span>
                <input value={seoForm.metaTitle} onChange={(event) => setSeoForm((prev) => ({ ...prev, metaTitle: event.target.value }))} />
              </label>
              <label className="stl-field">
                <span>Keywords</span>
                <input value={seoForm.keywords} onChange={(event) => setSeoForm((prev) => ({ ...prev, keywords: event.target.value }))} />
              </label>
              <label className="stl-field">
                <span>OG Title</span>
                <input value={seoForm.ogTitle} onChange={(event) => setSeoForm((prev) => ({ ...prev, ogTitle: event.target.value }))} />
              </label>
              <label className="stl-field">
                <span>Canonical URL</span>
                <input value={seoForm.canonicalUrl} onChange={(event) => setSeoForm((prev) => ({ ...prev, canonicalUrl: event.target.value }))} />
              </label>
              <label className="stl-field">
                <span>OG Image</span>
                <select
                  value={seoForm.ogImage || ''}
                  onChange={(event) => setSeoForm((prev) => ({ ...prev, ogImage: event.target.value ? Number(event.target.value) : null }))}
                >
                  <option value="">None</option>
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      #{asset.id} {asset.filename}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stl-field">
                <span>Status</span>
                <select
                  value={seoForm.status}
                  onChange={(event) => setSeoForm((prev) => ({ ...prev, status: event.target.value as 'draft' | 'published' }))}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </div>

            <label className="stl-field">
              <span>Meta Description</span>
              <textarea rows={3} value={seoForm.metaDescription} onChange={(event) => setSeoForm((prev) => ({ ...prev, metaDescription: event.target.value }))} />
            </label>

            <label className="stl-field">
              <span>OG Description</span>
              <textarea rows={3} value={seoForm.ogDescription} onChange={(event) => setSeoForm((prev) => ({ ...prev, ogDescription: event.target.value }))} />
            </label>

            <div className="stl-inline-actions">
              <label className="stl-checkbox">
                <input type="checkbox" checked={seoForm.noIndex} onChange={(event) => setSeoForm((prev) => ({ ...prev, noIndex: event.target.checked }))} />
                <span>No Index</span>
              </label>
              <label className="stl-checkbox">
                <input
                  type="checkbox"
                  checked={seoForm.noFollow}
                  onChange={(event) => setSeoForm((prev) => ({ ...prev, noFollow: event.target.checked }))}
                />
                <span>No Follow</span>
              </label>
            </div>

            <div className="stl-inline-actions">
              <button type="button" className="stl-btn" disabled={isSeoSaving} onClick={() => void handleSaveSeo()}>
                {isSeoSaving ? 'Saving...' : 'Save SEO'}
              </button>
              <button type="button" className="stl-btn stl-btn-secondary" onClick={() => setSeoModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
