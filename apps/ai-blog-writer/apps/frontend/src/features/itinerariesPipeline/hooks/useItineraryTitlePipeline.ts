import { useEffect, useMemo, useState } from 'react'
import { fetchLocations } from '../../listicleItineraries/api'
import type { LocationOption } from '../../listicleItineraries/types'
import { formatLocationLabel } from '../../../shared/locationScope/labels'
import {
  DEFAULT_ITINERARY_TITLE_MODEL,
  resolveItineraryTitleModelName,
  type ItineraryTitleModelName
} from '../constants/titleModel.constants'
import { generateItineraryTitles } from '../api'
import { buildItinerariesPipelineChatPrompt } from '../buildChatPrompt'
import {
  getItineraryPipelineTypeMarkdown,
  ITINERARY_PIPELINE_TYPE_OPTIONS,
  type ItineraryPipelineTypeId
} from '../type-content/itineraryTypeSources'
import {
  buildLocationSelectGroups,
  locationRowIdsEqual
} from '../locationSelectGroups'

export function useItineraryTitlePipeline(token?: string | null) {
  const [locationId, setLocationId] = useState<number | null>(null)
  const [dayCount, setDayCount] = useState(1)
  const [itineraryType, setItineraryType] = useState<ItineraryPipelineTypeId>(
    ITINERARY_PIPELINE_TYPE_OPTIONS[0].id
  )
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationsError, setLocationsError] = useState<string | null>(null)
  const [copyPromptStatus, setCopyPromptStatus] = useState<
    'idle' | 'copied' | 'error'
  >('idle')
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [pipelineResult, setPipelineResult] = useState<string | null>(null)
  const [pipelineModelUsed, setPipelineModelUsed] = useState<string | null>(
    null
  )
  const [pipelineModel, setPipelineModel] = useState<ItineraryTitleModelName>(
    DEFAULT_ITINERARY_TITLE_MODEL
  )

  const locationGroups = useMemo(
    () => buildLocationSelectGroups(locations),
    [locations]
  )
  const selectedLocation = useMemo(() => {
    if (locationId == null) return null
    return (
      locations.find((location) =>
        locationRowIdsEqual(location.id, locationId)
      ) ?? null
    )
  }, [locationId, locations])
  const typeMarkdown = useMemo(
    () => getItineraryPipelineTypeMarkdown(itineraryType),
    [itineraryType]
  )
  const selectedTypeOption = useMemo(
    () =>
      ITINERARY_PIPELINE_TYPE_OPTIONS.find(
        (option) => option.id === itineraryType
      ),
    [itineraryType]
  )
  const pipelinePrompt = useMemo(() => {
    if (!selectedTypeOption || !selectedLocation) return ''
    return buildItinerariesPipelineChatPrompt({
      typeLabel: selectedTypeOption.label,
      locationLabel: formatLocationLabel(selectedLocation),
      dayCount,
      guidelineMarkdown: typeMarkdown
    })
  }, [dayCount, selectedLocation, selectedTypeOption, typeMarkdown])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setLocationsLoading(true)
    setLocationsError(null)
    fetchLocations(token)
      .then((docs) => {
        if (!cancelled) setLocations(docs)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLocationsError(
            error instanceof Error ? error.message : 'Failed to load locations'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    setPipelineResult(null)
    setPipelineError(null)
    setPipelineModelUsed(null)
  }, [dayCount, itineraryType, locationId, pipelineModel])

  const handleCopyChatGptPrompt = async () => {
    if (!pipelinePrompt) return
    try {
      await navigator.clipboard.writeText(pipelinePrompt)
      setCopyPromptStatus('copied')
      window.setTimeout(() => setCopyPromptStatus('idle'), 2000)
    } catch {
      setCopyPromptStatus('error')
      window.setTimeout(() => setCopyPromptStatus('idle'), 2500)
    }
  }

  const handleRunTitlePipeline = async () => {
    if (!pipelinePrompt) return
    setPipelineLoading(true)
    setPipelineError(null)
    setPipelineResult(null)
    setPipelineModelUsed(null)
    try {
      const { text, model_used: modelUsed } = await generateItineraryTitles({
        prompt: pipelinePrompt,
        modelName: pipelineModel
      })
      setPipelineResult(text)
      setPipelineModelUsed(modelUsed)
    } catch (error: unknown) {
      setPipelineError(
        error instanceof Error ? error.message : 'Title pipeline failed'
      )
    } finally {
      setPipelineLoading(false)
    }
  }

  return {
    token,
    locationId,
    setLocationId,
    dayCount,
    setDayCount,
    itineraryType,
    setItineraryType,
    locationsLoading,
    locationsError,
    locationGroups,
    selectedTypeOption,
    typeMarkdown,
    copyPromptStatus,
    pipelinePrompt,
    pipelineLoading,
    pipelineError,
    pipelineResult,
    pipelineModelUsed,
    pipelineModel,
    setPipelineModel: (value: string) =>
      setPipelineModel(resolveItineraryTitleModelName(value)),
    handleCopyChatGptPrompt,
    handleRunTitlePipeline
  }
}

export type ItineraryTitlePipelineState = ReturnType<
  typeof useItineraryTitlePipeline
>
