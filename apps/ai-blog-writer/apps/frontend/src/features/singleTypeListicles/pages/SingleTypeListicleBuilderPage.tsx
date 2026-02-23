import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../providers/AuthProvider'
import { MarkdownBlockEditor } from '../../staging/features/markdown-editor'
import {
  createListicle,
  createSeoMetadata,
  fetchListicleById,
  fetchLocations,
  fetchMediaAssets,
  fetchRelatedItems,
  fetchSeoMetadata,
  fetchSeoMetadataById,
  getBlockTypeForListicleType,
  markdownToLexical,
  updateListicle,
  updateSeoMetadata,
} from '../api'
import {
  createEmptyDraft,
  findDraftByDraftId,
  findDraftByPayloadId,
  removeDraft,
  saveDraft,
} from '../storage'
import type {
  ListicleItemBlock,
  ListicleType,
  PayloadListicleDoc,
  RelatedItemOption,
  SeoMetadataForm,
  SeoMetadataOption,
  SingleTypeListicleDraft,
} from '../types'
import '../styles.css'

const LISTICLE_TYPE_OPTIONS: Array<{ label: string; value: ListicleType }> = [
  { label: 'Dining', value: 'dining' },
  { label: 'Accommodations', value: 'accommodations' },
  { label: 'Attractions', value: 'attractions' },
  { label: 'Nightlife', value: 'nightlife' },
]

function getRelationshipId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

function payloadDocToDraft(doc: PayloadListicleDoc, existingDraftId?: string): SingleTypeListicleDraft {
  const items: ListicleItemBlock[] = (doc.items || []).map((item, index) => ({
    id: item.id || `item_${Date.now()}_${index}`,
    blockType: item.blockType || 'data-dining',
    item: getRelationshipId(item.item),
    blurbMarkdown: '',
    blurbLexical: item.blurb,
    blurbJsonText: item.blurb ? JSON.stringify(item.blurb, null, 2) : '',
  }))

  return {
    draftId: existingDraftId || `stl_payload_${doc.id}`,
    payloadId: doc.id,
    title: doc.title || '',
    location: doc.location || '',
    locationRef: getRelationshipId(doc.locationRef),
    listicleType: doc.listicleType || '',
    targetItemCount: doc.targetItemCount || 6,
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
    articleType: 'single-type-listicle',
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
  const ogDescription = normalizeText(form.ogDescription)

  return {
    ...form,
    metaTitle: normalizeText(form.metaTitle),
    metaDescription: metaDescription.length >= 50 ? metaDescription : '',
    keywords: normalizeText(form.keywords),
    ogTitle: normalizeText(form.ogTitle),
    ogDescription,
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

export default function SingleTypeListicleBuilderPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const payloadIdParam = searchParams.get('id')
  const draftIdParam = searchParams.get('draftId')

  const [draft, setDraft] = useState<SingleTypeListicleDraft | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const [locations, setLocations] = useState<Array<{ id: number; locationKey: string }>>([])
  const [mediaAssets, setMediaAssets] = useState<Array<{ id: number; filename: string }>>([])
  const [relatedItems, setRelatedItems] = useState<RelatedItemOption[]>([])
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)
  const [setupBaseline, setSetupBaseline] = useState<{ location: string; listicleType: ListicleType | '' } | null>(null)

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
            const doc = await fetchListicleById(payloadId, token)
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
        // Persist immediately so the follow-up render can resolve this id from storage.
        saveDraft(fresh)
        setDraft(fresh)
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('draftId', fresh.draftId)
          return next
        }, { replace: true })
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
    if (!token || !draft?.listicleType || !draft.location) {
      setRelatedItems([])
      return
    }

    let cancelled = false
    setIsLoadingRelated(true)

    fetchRelatedItems(draft.listicleType, draft.location, token)
      .then((docs) => {
        if (cancelled) return
        setRelatedItems(docs)
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
  }, [token, draft?.listicleType, draft?.location])

  const selectedLocationRefId = useMemo(() => {
    if (!draft?.location) return null
    const selected = locations.find((location) => location.locationKey === draft.location)
    return selected?.id || null
  }, [draft?.location, locations])

  function updateDraft(next: Partial<SingleTypeListicleDraft>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        ...next,
      }
    })
  }

  function updateHeader(next: Partial<SingleTypeListicleDraft['header']>) {
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

  function updateItem(itemId: string, updater: (item: ListicleItemBlock) => ListicleItemBlock) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? updater(item) : item)),
      }
    })
  }

  function removeItem(itemId: string) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      }
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
      return {
        ...current,
        items,
      }
    })
  }

  function addItem() {
    if (!draft?.listicleType) {
      setError('Select a listicle type before adding items')
      return
    }

    const blockType = getBlockTypeForListicleType(draft.listicleType)
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: [
          ...current.items,
          {
            id: `item_${Date.now()}`,
            blockType,
            item: null,
            blurbMarkdown: '',
            blurbJsonText: '',
          },
        ],
      }
    })
  }

  function validateStep1(current: SingleTypeListicleDraft): string[] {
    const issues: string[] = []
    if (!current.title.trim()) issues.push('Title is required')
    if (!current.location.trim()) issues.push('Location is required')
    if (!current.listicleType) issues.push('Listicle data type is required')
    if (!Number.isFinite(current.targetItemCount) || current.targetItemCount < 1 || current.targetItemCount > 50) {
      issues.push('Target list size must be between 1 and 50')
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
      listicleType: draft.listicleType,
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

    const prevType = setupBaseline?.listicleType
    const prevLocation = setupBaseline?.location

    const typeChanged = prevType && prevType !== draft.listicleType
    const locationChanged = prevLocation && prevLocation !== draft.location

    if ((typeChanged || locationChanged) && draft.items.length > 0) {
      const confirmed = window.confirm(
        'Changing listicle type or location clears current list items. Continue?'
      )
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
        setSeoOptions((prev) => [
          { id: Number(created.id), metaTitle: created.metaTitle, status: created.status },
          ...prev,
        ])
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
            item.id === Number(updated.id)
              ? { ...item, metaTitle: updated.metaTitle, status: updated.status }
              : item
          )
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

    const stepIssues = validateStep1(draft)
    if (stepIssues.length > 0) {
      setError(stepIssues.join('. '))
      return
    }

    if (draft.items.length > draft.targetItemCount) {
      setError(`This list has ${draft.items.length} items, but target size is ${draft.targetItemCount}`)
      return
    }

    if (targetStatus === 'published' && draft.items.length !== draft.targetItemCount) {
      setError(
        `Publishing requires exactly ${draft.targetItemCount} items. Current item count is ${draft.items.length}`
      )
      return
    }

    if (!draft.listicleType) {
      setError('Listicle type is required')
      return
    }

    const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
    if (draft.items.some((item) => item.blockType !== expectedBlockType)) {
      setError('Item block types do not match selected listicle type')
      return
    }

    if (!selectedLocationRefId) {
      setError('Select a valid location')
      return
    }

    try {
      setIsSaving(true)

      const headerIntro = draft.header.introMarkdown.trim()
        ? await markdownToLexical(draft.header.introMarkdown)
        : readLexicalFromJsonText(draft.header.introJsonText || '', 'Header intro')
      if (
        !draft.header.introMarkdown.trim()
        && !draft.header.introJsonText?.trim()
      ) {
        throw new Error('Header intro is required (markdown or lexical JSON)')
      }

      const payloadItems = [] as Array<Record<string, unknown>>
      for (let index = 0; index < draft.items.length; index += 1) {
        const item = draft.items[index]
        if (!item.item) {
          throw new Error(`Item ${index + 1} is missing related entry selection`)
        }

        const blurb = item.blurbMarkdown.trim()
          ? await markdownToLexical(item.blurbMarkdown)
          : readLexicalFromJsonText(item.blurbJsonText || '', `Item ${index + 1} blurb`)
        if (!item.blurbMarkdown.trim() && !item.blurbJsonText?.trim()) {
          throw new Error(`Item ${index + 1} blurb is required (markdown or lexical JSON)`)
        }

        payloadItems.push({
          blockType: item.blockType,
          item: item.item,
          blurb,
        })
      }

      const body: Record<string, unknown> = {
        title: draft.title.trim(),
        location: draft.location,
        locationRef: selectedLocationRefId,
        listicleType: draft.listicleType,
        targetItemCount: draft.targetItemCount,
        step1_complete: true,
        in_update_mode: false,
        header: {
          customTitle: draft.header.customTitle.trim() || undefined,
          intro: headerIntro,
          featuredImage: draft.header.featuredImage || undefined,
        },
        items: payloadItems,
        seoSection: {
          seo: draft.seoSection.seo || undefined,
        },
        status: targetStatus,
        articleType: 'single-type-listicle',
      }

      const doc = draft.payloadId
        ? await updateListicle(draft.payloadId, body, token)
        : await createListicle(body, token)

      const nextDraft = payloadDocToDraft(doc, draft.draftId)
      nextDraft.header.introMarkdown = draft.header.introMarkdown
      nextDraft.items = nextDraft.items.map((nextItem, index) => ({
        ...nextItem,
        blurbMarkdown: draft.items[index]?.blurbMarkdown || '',
      }))
      setDraft(nextDraft)
      saveDraft(nextDraft)

      setResult(
        targetStatus === 'published'
          ? `Published listicle #${doc.id}`
          : `Saved draft listicle #${doc.id}`
      )

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('id', String(doc.id))
        next.set('draftId', nextDraft.draftId)
        return next
      }, { replace: true })
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
      navigate(`/single-type-listicles/builder?id=${draft.payloadId}`)
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

  const blockTypeOptions = draft.listicleType
    ? [getBlockTypeForListicleType(draft.listicleType)]
    : []
  const stepIssues = validateStep1(draft)
  const isSetupReady = stepIssues.length === 0
  const hasTargetCount = draft.items.length === draft.targetItemCount
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
          hasTargetCount ? 1 : 0,
          draft.seoSection.seo ? 1 : 0,
        ].reduce((sum, value) => sum + value, 0) /
          6) *
          100
      )
    )
  )

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Single Type Listicle Builder</p>
          <h1>{draft.payloadId ? `Edit #${draft.payloadId}` : 'New Listicle'}</h1>
          <p className="stl-lede">
            Field-by-field and block-by-block editor for Payload `single-type-listicles`.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link to="/single-type-listicles" className="stl-btn stl-btn-secondary">
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
          <h2><span className="stl-kicker">Step 1</span> Setup</h2>
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
            <span>Listicle Data Type *</span>
            <select
              value={draft.listicleType}
              disabled={draft.step1_complete && !draft.in_update_mode}
              onChange={(event) => updateDraft({ listicleType: event.target.value as ListicleType | '' })}
            >
              <option value="">Select type</option>
              {LISTICLE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="stl-field">
            <span>Target List Size (1-50) *</span>
            <input
              type="number"
              min={1}
              max={50}
              value={draft.targetItemCount}
              disabled={draft.step1_complete && !draft.in_update_mode}
              onChange={(event) => updateDraft({ targetItemCount: Number(event.target.value) || 0 })}
            />
          </label>
        </div>
      </section>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2><span className="stl-kicker">Step 2</span> Header</h2>
        </div>
        <div className="stl-grid stl-grid-2">
          <label className="stl-field">
            <span>Custom Title</span>
            <input
              value={draft.header.customTitle}
              onChange={(event) => updateHeader({ customTitle: event.target.value })}
            />
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
            placeholder="Write the listicle intro..."
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
          <h2><span className="stl-kicker">Step 3</span>
            Items ({draft.items.length}/{draft.targetItemCount})
          </h2>
          <button
            type="button"
            className="stl-btn"
            onClick={addItem}
            disabled={!draft.listicleType}
          >
            Add Item
          </button>
        </div>

        {isLoadingRelated ? <p className="stl-placeholder">Loading related items...</p> : null}
        {!isLoadingRelated && draft.listicleType && relatedItems.length === 0 ? (
          <p className="stl-placeholder">No published items found for selected location/type.</p>
        ) : null}

        <div className="stl-list">
          {draft.items.map((item, index) => (
            <article key={item.id} className="stl-item-card">
              <header className="stl-item-header">
                <h3>Item {index + 1}</h3>
                <div className="stl-inline-actions">
                  <button type="button" className="stl-btn stl-btn-secondary" onClick={() => moveItem(item.id, 'up')}>
                    Up
                  </button>
                  <button type="button" className="stl-btn stl-btn-secondary" onClick={() => moveItem(item.id, 'down')}>
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
                        blockType: event.target.value as ListicleItemBlock['blockType'],
                      }))
                    }
                  >
                    {blockTypeOptions.map((blockType) => (
                      <option key={blockType} value={blockType}>
                        {blockType}
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
                    {relatedItems.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        #{entry.id} {entry.title}
                      </option>
                    ))}
                  </select>
                </label>
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
                  placeholder="Write why this item made the list..."
                  className="stl-markdown-textarea"
                  rows={5}
                />
              </label>
              {!item.blurbMarkdown.trim() && item.blurbJsonText?.trim() ? (
                <p className="stl-legacy-note">
                  This blurb currently exists as Lexical JSON in Payload. Editing here will replace it.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2><span className="stl-kicker">Step 4</span> SEO & Metadata</h2>
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
          <h2><span className="stl-kicker">Step 5</span> Publish</h2>
        </div>

        <div className="stl-grid stl-grid-2">
          <label className="stl-field">
            <span>Status</span>
            <select
              value={draft.status}
              onChange={(event) => updateDraft({ status: event.target.value as 'draft' | 'published' })}
            >
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
              <li className={draft.items.length > 0 ? 'done' : ''}>
                Items: {draft.items.length} added
              </li>
              <li className={hasTargetCount ? 'done' : ''}>
                Target match: {hasTargetCount ? 'Met' : `Need ${Math.max(0, draft.targetItemCount - draft.items.length)} more`}
              </li>
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
            <p className="stl-summary-note">
              Publishing requires exactly <strong>{draft.targetItemCount}</strong> items.
            </p>
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
                  onChange={(event) =>
                    setSeoForm((prev) => ({ ...prev, status: event.target.value as 'draft' | 'published' }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </div>

            <label className="stl-field">
              <span>Meta Description</span>
              <textarea
                rows={3}
                value={seoForm.metaDescription}
                onChange={(event) => setSeoForm((prev) => ({ ...prev, metaDescription: event.target.value }))}
              />
            </label>

            <label className="stl-field">
              <span>OG Description</span>
              <textarea
                rows={3}
                value={seoForm.ogDescription}
                onChange={(event) => setSeoForm((prev) => ({ ...prev, ogDescription: event.target.value }))}
              />
            </label>

            <div className="stl-inline-actions">
              <label className="stl-checkbox">
                <input
                  type="checkbox"
                  checked={seoForm.noIndex}
                  onChange={(event) => setSeoForm((prev) => ({ ...prev, noIndex: event.target.checked }))}
                />
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
