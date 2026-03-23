import { useState, useRef, useCallback, useEffect } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MultiVariantCropper } from '../../images/components/MultiVariantCropper'
import { generateAltText, uploadImageVariants, resolveTagsByName } from '../../images/api/imagesApi'
import { validateImageFile } from '../../images/validators/image-upload.validators'
import { parsePhotographerFromFilename, parseSeriesSlugFromFilename } from '../../images/utils/imageProcessing'
import type { ImageVariantType } from '../../images/utils/imageProcessing'
import { fetchLocations } from '../../staging/api/payload/payload.api'
import type { Location } from '../../staging/api/payload/payload.types'
import { useAuth } from '../../../providers/useAuth'
import { saveCrop, loadCrop, deleteCrop, clearAllCrops } from '../cropCache'
import '../styles.css'

type VariantUploadFile = { type: ImageVariantType; file: File }

interface ProcessedSet {
  variantFiles: VariantUploadFile[]
}

interface ImageMeta {
  credit: string
  tagNames: string[]
}

interface AltTextState {
  status: 'loading' | 'done' | 'error'
  text: string
}

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error'
  progress: number
  message: string
}

interface CropModalState {
  open: boolean
  index: number | null
}

// ── Local storage cache (keyed by filename) ────────────────────────────────

const BU_CACHE_KEY = 'bu_img_cache'

interface CachedImage {
  altText?: string
  altStatus?: 'done' | 'error'
  locationRef?: number | null
}

function readCache(): Record<string, CachedImage> {
  try { return JSON.parse(localStorage.getItem(BU_CACHE_KEY) ?? '{}') } catch { return {} }
}

function writeCache(filename: string, patch: Partial<CachedImage>) {
  try {
    const cache = readCache()
    cache[filename] = { ...cache[filename], ...patch }
    localStorage.setItem(BU_CACHE_KEY, JSON.stringify(cache))
  } catch { /* quota exceeded — silently skip */ }
}

// ──────────────────────────────────────────────────────────────────────────────

function sanitizeExternalRef(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

function parseMetaFromFilename(filename: string): ImageMeta {
  const credit = parsePhotographerFromFilename(filename) ?? ''
  const seriesSlug = parseSeriesSlugFromFilename(filename)
  return { credit, tagNames: seriesSlug ? [seriesSlug] : [] }
}

function groupLocations(locations: Location[]) {
  const countries = locations.filter((l) => l.level === 'country')
  const cities = locations.filter((l) => l.level === 'city')
  const neighborhoods = locations.filter((l) => l.level === 'neighborhood')
  return countries.map((country) => {
    const countryCities = cities.filter((c) => c.parentKey === country.locationKey)
    return {
      country,
      cities: countryCities.map((city) => ({
        city,
        neighborhoods: neighborhoods.filter((n) => n.parentKey === city.locationKey),
      })),
    }
  })
}

function buildLocationMap(locations: Location[]): Map<number, Location> {
  return new Map(locations.map((l) => [l.id, l]))
}

function locationLabel(loc: Location): string {
  return loc.neighborhoodName ?? loc.cityName ?? loc.countryName ?? String(loc.id)
}

export function BatchUploadPage() {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [imageMetas, setImageMetas] = useState<ImageMeta[]>([])
  const [altTextStates, setAltTextStates] = useState<AltTextState[]>([])
  const [locationRefs, setLocationRefs] = useState<(number | null)[]>([])
  const [processedSets, setProcessedSets] = useState<(ProcessedSet | null)[]>([])
  const [uploadStates, setUploadStates] = useState<UploadState[]>([])
  const [thumbnailUrls, setThumbnailUrls] = useState<(string | null)[]>([])
  const [lightbox, setLightbox] = useState<{ index: number; url: string } | null>(null)
  const [cropModal, setCropModal] = useState<CropModalState>({ open: false, index: null })
  const [isDragging, setIsDragging] = useState(false)
  const [isUploadingAll, setIsUploadingAll] = useState(false)
  const [openLocationIndex, setOpenLocationIndex] = useState<number | null>(null)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(token ?? undefined),
    enabled: !!token,
    staleTime: 10 * 60 * 1000,
  })
  const allLocations = locationsData?.docs ?? []
  const locationGroups = groupLocations(allLocations)
  const locationMap = buildLocationMap(allLocations)

  useEffect(() => {
    if (openLocationIndex === null) return
    function onMouseDown(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-loc-wrap]')) setOpenLocationIndex(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [openLocationIndex])

  // ── Alt text queue (max 4 concurrent to avoid Vertex rate limits) ──────────

  const ALT_TEXT_CONCURRENCY = 4
  const altTextQueue = useRef<Array<{ file: File; index: number }>>([])
  const altTextRunning = useRef(0)

  function processAltTextQueue() {
    while (altTextRunning.current < ALT_TEXT_CONCURRENCY && altTextQueue.current.length > 0) {
      const item = altTextQueue.current.shift()!
      altTextRunning.current++
      generateAltText(item.file)
        .then((text) => {
          writeCache(item.file.name, { altText: text, altStatus: 'done' })
          setAltTextStates((prev) => {
            const next = [...prev]
            next[item.index] = { status: 'done', text }
            return next
          })
        })
        .catch(() => {
          writeCache(item.file.name, { altStatus: 'error', altText: '' })
          setAltTextStates((prev) => {
            const next = [...prev]
            next[item.index] = { status: 'error', text: '' }
            return next
          })
        })
        .finally(() => {
          altTextRunning.current--
          processAltTextQueue()
        })
    }
  }

  function enqueueAltText(file: File, index: number) {
    altTextQueue.current.push({ file, index })
    processAltTextQueue()
  }

  // ── Thumbnail generation ────────────────────────────────────────────────────

  function makeThumbnail(file: File): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      const objUrl = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 400
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(objUrl)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve('') }
      img.src = objUrl
    })
  }

  function openLightbox(index: number) {
    if (lightbox) URL.revokeObjectURL(lightbox.url)
    setLightbox({ index, url: URL.createObjectURL(selectedFiles[index]) })
  }

  function closeLightbox() {
    if (lightbox) URL.revokeObjectURL(lightbox.url)
    setLightbox(null)
  }

  // ── File Selection ─────────────────────────────────────────────────────────

  function handleFileSelect(incoming: FileList | null) {
    if (!incoming) return
    const valid: File[] = []
    for (const file of Array.from(incoming)) {
      const err = validateImageFile(file)
      if (!err) valid.push(file)
    }
    if (valid.length === 0) return

    const startIndex = selectedFiles.length
    const cache = readCache()

    const newAltStates: AltTextState[] = valid.map((f) => {
      const hit = cache[f.name]
      if (hit?.altStatus === 'done' && hit.altText) return { status: 'done', text: hit.altText }
      return { status: 'loading', text: '' }
    })

    const newLocationRefs: (number | null)[] = valid.map((f) => {
      const hit = cache[f.name]
      return hit && 'locationRef' in hit ? (hit.locationRef ?? null) : null
    })

    setSelectedFiles((prev) => [...prev, ...valid])
    setImageMetas((prev) => [...prev, ...valid.map((f) => parseMetaFromFilename(f.name))])
    setAltTextStates((prev) => [...prev, ...newAltStates])
    setLocationRefs((prev) => [...prev, ...newLocationRefs])
    setProcessedSets((prev) => [...prev, ...Array(valid.length).fill(null)])
    setUploadStates((prev) => [...prev, ...valid.map(() => ({ status: 'idle' as const, progress: 0, message: '' }))])
    setThumbnailUrls((prev) => [...prev, ...valid.map(() => null)])

    // Only enqueue alt text for files not already cached
    valid.forEach((file, j) => {
      const hit = cache[file.name]
      if (!hit || hit.altStatus !== 'done' || !hit.altText) {
        enqueueAltText(file, startIndex + j)
      }
    })

    // Restore any previously saved crops from IndexedDB
    valid.forEach((file, j) => {
      loadCrop(file.name).then((stored) => {
        if (!stored) return
        const variantFiles = stored.variants.map((v) => ({
          type: v.type as ImageVariantType,
          file: new File([v.blob], v.name, { type: v.blob.type || 'image/jpeg' }),
        }))
        setProcessedSets((prev) => {
          const next = [...prev]
          next[startIndex + j] = { variantFiles }
          return next
        })
      }).catch(() => {})
    })

    // Generate thumbnails in background — canvas-resized so the DOM never loads full-res
    valid.forEach((file, j) => {
      makeThumbnail(file).then((dataUrl) => {
        setThumbnailUrls((prev) => {
          const next = [...prev]
          next[startIndex + j] = dataUrl
          return next
        })
      })
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleRemoveFile(index: number) {
    deleteCrop(selectedFiles[index].name).catch(() => {})
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setImageMetas((prev) => prev.filter((_, i) => i !== index))
    setAltTextStates((prev) => prev.filter((_, i) => i !== index))
    setLocationRefs((prev) => prev.filter((_, i) => i !== index))
    setProcessedSets((prev) => prev.filter((_, i) => i !== index))
    setUploadStates((prev) => prev.filter((_, i) => i !== index))
    setThumbnailUrls((prev) => prev.filter((_, i) => i !== index))
    if (cropModal.index === index) setCropModal({ open: false, index: null })
    if (lightbox?.index === index) closeLightbox()
  }

  function handleAltTextChange(index: number, text: string) {
    writeCache(selectedFiles[index].name, { altText: text, altStatus: 'done' })
    setAltTextStates((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], text }
      return next
    })
  }

  function handleLocationChange(index: number, locationId: number | null) {
    writeCache(selectedFiles[index].name, { locationRef: locationId })
    setLocationRefs((prev) => {
      const next = [...prev]
      next[index] = locationId
      return next
    })
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  function handleDragOver(e: DragEvent) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); setIsDragging(false) }
  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  // ── Crop Modal ─────────────────────────────────────────────────────────────

  const findNextUnprocessed = useCallback((startFrom: number, sets: (ProcessedSet | null)[]): number | null => {
    for (let i = startFrom; i < sets.length; i++) {
      if (!sets[i]) return i
    }
    return null
  }, [])

  function handleCropConfirm(variantFiles: { type: ImageVariantType; file: File }[]) {
    const idx = cropModal.index
    if (idx === null) return

    const updatedSets = [...processedSets]
    updatedSets[idx] = { variantFiles }
    setProcessedSets(updatedSets)

    // Persist to IndexedDB immediately — silent background save, no UI disruption
    saveCrop(selectedFiles[idx].name, variantFiles).catch(() => {})

    const nextUncropped = findNextUnprocessed(idx + 1, updatedSets)
    setCropModal(nextUncropped !== null ? { open: true, index: nextUncropped } : { open: false, index: null })
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function handleUploadAll() {
    if (!token) return
    setIsUploadingAll(true)

    for (let i = 0; i < processedSets.length; i++) {
      const set = processedSets[i]
      if (!set) continue

      const meta = imageMetas[i]
      const altText = altTextStates[i]?.text ?? ''
      const locationRef = (locationRefs[i] != null && locationRefs[i]! > 0) ? locationRefs[i]! : undefined
      const externalRef = sanitizeExternalRef(selectedFiles[i].name)

      setUploadStates((prev) => {
        const next = [...prev]
        next[i] = { status: 'uploading', progress: 0, message: 'Preparing...' }
        return next
      })

      try {
        let tagIds: number[] | undefined
        if (meta.tagNames.length > 0) {
          const resolved = await resolveTagsByName(meta.tagNames, token)
          tagIds = resolved.map((t) => t.id)
        }

        await uploadImageVariants(
          set.variantFiles,
          externalRef,
          altText,
          locationRef,
          token,
          meta.credit,
          (progress) => {
            setUploadStates((prev) => {
              const next = [...prev]
              next[i] = { status: 'uploading', progress: progress.progress, message: progress.message }
              return next
            })
          },
          tagIds,
        )

        setUploadStates((prev) => {
          const next = [...prev]
          next[i] = { status: 'success', progress: 100, message: 'Uploaded' }
          return next
        })
      } catch (err) {
        setUploadStates((prev) => {
          const next = [...prev]
          next[i] = { status: 'error', progress: 0, message: err instanceof Error ? err.message : 'Upload failed' }
          return next
        })
      }
    }

    setIsUploadingAll(false)
  }

  function handleReset() {
    clearAllCrops().catch(() => {})
    if (lightbox) URL.revokeObjectURL(lightbox.url)
    setSelectedFiles([])
    setImageMetas([])
    setAltTextStates([])
    setLocationRefs([])
    setProcessedSets([])
    setUploadStates([])
    setThumbnailUrls([])
    setLightbox(null)
    setCropModal({ open: false, index: null })
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const allCropped = selectedFiles.length > 0 && processedSets.every((s) => s !== null)
  const croppedCount = processedSets.filter(Boolean).length
  const allHaveCredit = imageMetas.length > 0 && imageMetas.every((m) => m.credit.trim().length > 0)
  const allAltTextDone = altTextStates.length > 0 && altTextStates.every((s) => s.status !== 'loading' && s.text.trim().length > 0)
  const allHaveLocation = locationRefs.length > 0 && locationRefs.every((r) => r !== null)
  const anyUploaded = uploadStates.some((s) => s.status === 'success')
  const allUploaded = uploadStates.length > 0 && uploadStates.every((s) => s.status === 'success')
  const canUpload = allCropped && allHaveCredit && allAltTextDone && allHaveLocation && !isUploadingAll && !allUploaded
  const showDropZone = selectedFiles.length === 0 || anyUploaded

  // ── Upload button label + tooltip ─────────────────────────────────────────

  function uploadButtonLabel() {
    if (isUploadingAll) return 'Uploading...'
    if (allUploaded) return `✓ ${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''} uploaded`
    if (!allAltTextDone) return 'Generating alt text...'
    if (!allHaveLocation) return 'Assign locations to continue'
    if (!allCropped) return `Crop ${selectedFiles.length - croppedCount} more to continue`
    return `Upload All (${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''})`
  }

  function uploadBlockedTooltip(): string | undefined {
    if (canUpload || isUploadingAll || allUploaded) return undefined
    const reasons: string[] = []
    const generating = altTextStates.filter((s) => s.status === 'loading').length
    const emptyAlt = altTextStates.filter((s) => s.status !== 'loading' && !s.text.trim()).length
    if (generating > 0) reasons.push(`${generating} alt text${generating > 1 ? 's' : ''} still generating`)
    if (emptyAlt > 0) reasons.push(`${emptyAlt} image${emptyAlt > 1 ? 's' : ''} missing alt text`)
    const missingLoc = locationRefs.filter((r) => r === null).length
    if (missingLoc > 0) reasons.push(`${missingLoc} image${missingLoc > 1 ? 's' : ''} need a location`)
    const uncropped = processedSets.filter((s) => !s).length
    if (uncropped > 0) reasons.push(`${uncropped} image${uncropped > 1 ? 's' : ''} not cropped`)
    const noCredit = imageMetas.filter((m) => !m.credit.trim()).length
    if (noCredit > 0) reasons.push(`${noCredit} image${noCredit > 1 ? 's' : ''} missing credit`)
    return reasons.join(' · ')
  }

  // ── Crop mode — full-screen takeover ──────────────────────────────────────

  if (cropModal.open && cropModal.index !== null) {
    return (
      <div className="bu-page">
        <MultiVariantCropper
          key={cropModal.index}
          file={selectedFiles[cropModal.index]}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropModal({ open: false, index: null })}
        />
      </div>
    )
  }

  // ── Main page ──────────────────────────────────────────────────────────────

  return (
    <div className="bu-page">
      <header className="bu-hero">
        <div className="bu-hero-nav">
          <p className="bu-eyebrow">Questurian Studio</p>
          <Link to="/" className="bu-back-link">← Back to Home</Link>
        </div>
        <h1>Batch Image <span className="bu-highlight">Upload</span><span className="bu-dot">.</span></h1>
        <p className="bu-lede">
          Drop photos named <code>author_series-number.jpg</code>. Credit and tags are parsed automatically. Alt text generates per image in the background.
        </p>
      </header>

      <main className="bu-shell">
        {showDropZone && (
          <section
            className={`bu-dropzone${isDragging ? ' bu-dropzone--active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg className="bu-upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round"/>
            </svg>
            <p className="bu-dropzone-label">Drag and drop photos here</p>
            <p className="bu-dropzone-sub">or</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files)}
              className="bu-hidden" />
            <button type="button" className="bu-btn-primary" onClick={() => fileInputRef.current?.click()}>
              Choose Files
            </button>
          </section>
        )}

        {selectedFiles.length > 0 && (
          <section className="bu-grid-section">
            <div className="bu-grid-header">
              <h2 className="bu-section-title">{croppedCount}/{selectedFiles.length} cropped</h2>
              <button type="button" className="bu-btn-ghost" onClick={() => fileInputRef.current?.click()}>
                + Add more
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files)}
                className="bu-hidden" />
            </div>

            <div className="bu-image-grid">
              {selectedFiles.map((file, i) => {
                const isCropped = processedSets[i] !== null
                const uploadState = uploadStates[i]
                const meta = imageMetas[i]
                const altState = altTextStates[i]
                const thumbUrl = thumbnailUrls[i]
                const locationRef = locationRefs[i]

                return (
                  <div key={`${file.name}-${i}`} className={`bu-image-card${isCropped ? ' bu-image-card--cropped' : ''}`}>
                    <div className="bu-image-thumb-wrap">
                      {thumbUrl
                        ? <img src={thumbUrl} alt={altState?.text || file.name} className="bu-image-thumb" />
                        : <div className="bu-thumb-shimmer" />
                      }
                      <button
                        type="button"
                        className="bu-thumb-expand"
                        onClick={() => openLightbox(i)}
                        title="View full resolution"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                        </svg>
                      </button>

                      {altState?.status === 'loading' && (
                        <span className="bu-alt-badge bu-alt-badge--loading" title="Generating alt text...">
                          <svg className="bu-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                          </svg>
                        </span>
                      )}
                      {altState?.status === 'done' && (
                        <span className="bu-alt-badge bu-alt-badge--done" title="Alt text ready">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </span>
                      )}
                      {altState?.status === 'error' && (
                        <span className="bu-alt-badge bu-alt-badge--error" title="Alt text failed — will upload without">!</span>
                      )}

                      {isCropped && (
                        <span className="bu-crop-badge" title="Cropped">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </span>
                      )}

                      {uploadState?.status === 'success' && (
                        <span className="bu-success-badge" title="Uploaded">✓</span>
                      )}
                    </div>

                    <p className="bu-image-name" title={file.name}>{file.name}</p>

                    <textarea
                      className={`bu-alt-textarea${altState?.status === 'loading' ? ' bu-alt-textarea--loading' : altState?.status === 'error' && !altState.text ? ' bu-alt-textarea--empty' : ''}`}
                      value={altState?.text ?? ''}
                      onChange={(e) => handleAltTextChange(i, e.target.value)}
                      placeholder={altState?.status === 'loading' ? 'Generating alt text…' : 'Alt text (required)'}
                      disabled={altState?.status === 'loading' || isUploadingAll}
                      rows={3}
                    />

                    {meta && (
                      <div className="bu-image-meta">
                        {meta.credit
                          ? <span className="bu-image-credit">{meta.credit}</span>
                          : <span className="bu-image-credit bu-image-credit--missing">No credit</span>
                        }
                        {meta.tagNames.length > 0 && (
                          <span className="bu-image-tag">{meta.tagNames[0]}</span>
                        )}
                      </div>
                    )}

                    {/* Location picker */}
                    <div className="bu-loc-wrap" data-loc-wrap>
                      <button
                        type="button"
                        className={`bu-loc-trigger${locationRef === null ? ' bu-loc-trigger--unset' : locationRef === 0 ? ' bu-loc-trigger--none' : ' bu-loc-trigger--set'}`}
                        onClick={() => setOpenLocationIndex(openLocationIndex === i ? null : i)}
                        disabled={isUploadingAll}
                      >
                        <span className="bu-loc-trigger-label">
                          {locationRef === null && '— select location —'}
                          {locationRef === 0 && 'No location'}
                          {locationRef !== null && locationRef > 0 && (locationMap.get(locationRef) ? locationLabel(locationMap.get(locationRef)!) : 'Location')}
                        </span>
                        <svg className={`bu-loc-chevron${openLocationIndex === i ? ' bu-loc-chevron--open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>

                      {openLocationIndex === i && (
                        <div className="bu-loc-panel">
                          <button
                            type="button"
                            className="bu-loc-option bu-loc-option--none"
                            onClick={() => { handleLocationChange(i, 0); setOpenLocationIndex(null) }}
                          >
                            No location
                          </button>
                          <div className="bu-loc-divider" />
                          {locationGroups.map(({ country, cities }) => (
                            <div key={country.id}>
                              <button
                                type="button"
                                className={`bu-loc-option bu-loc-option--country${locationRef === country.id ? ' bu-loc-option--active' : ''}`}
                                onClick={() => { handleLocationChange(i, country.id); setOpenLocationIndex(null) }}
                              >
                                {country.countryName}
                              </button>
                              {cities.map(({ city, neighborhoods }) => (
                                <div key={city.id}>
                                  <button
                                    type="button"
                                    className={`bu-loc-option bu-loc-option--city${locationRef === city.id ? ' bu-loc-option--active' : ''}`}
                                    onClick={() => { handleLocationChange(i, city.id); setOpenLocationIndex(null) }}
                                  >
                                    {city.cityName}
                                  </button>
                                  {neighborhoods.map((n) => (
                                    <button
                                      key={n.id}
                                      type="button"
                                      className={`bu-loc-option bu-loc-option--neighborhood${locationRef === n.id ? ' bu-loc-option--active' : ''}`}
                                      onClick={() => { handleLocationChange(i, n.id); setOpenLocationIndex(null) }}
                                    >
                                      {n.neighborhoodName}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {uploadState?.status === 'uploading' && (
                      <div className="bu-progress-wrap">
                        <div className="bu-progress-bar" style={{ width: `${uploadState.progress}%` }} />
                        <span className="bu-progress-label">{uploadState.progress}%</span>
                      </div>
                    )}
                    {uploadState?.status === 'error' && (
                      <p className="bu-error bu-error--small">{uploadState.message}</p>
                    )}

                    <div className="bu-image-actions">
                      <button type="button" className="bu-btn-ghost bu-btn-xs"
                        onClick={() => setCropModal({ open: true, index: i })}
                        disabled={isUploadingAll}>
                        {isCropped ? 'Re-crop' : 'Crop'}
                      </button>
                      <button type="button" className="bu-btn-ghost bu-btn-xs bu-btn-danger"
                        onClick={() => handleRemoveFile(i)}
                        disabled={isUploadingAll}
                        aria-label={`Remove ${file.name}`}>
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {allUploaded && (
              <div className="bu-success-banner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                All {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} uploaded successfully.{' '}
                <button type="button" className="bu-btn-ghost" onClick={handleReset} style={{ padding: '0', fontSize: '0.82rem' }}>
                  Upload more
                </button>
              </div>
            )}

            <div className="bu-actions" style={{ marginTop: '1.25rem' }}>
              <span className="bu-tooltip-wrap" data-tooltip={uploadBlockedTooltip()}>
                <button type="button" className="bu-btn-primary bu-btn-upload"
                  onClick={() => void handleUploadAll()}
                  disabled={!canUpload}>
                  {uploadButtonLabel()}
                </button>
              </span>
              <button type="button" className="bu-btn-secondary" onClick={handleReset} disabled={isUploadingAll}>
                Clear All
              </button>
            </div>
          </section>
        )}
      </main>

      {lightbox && (
        <div className="bu-lightbox-overlay" onClick={closeLightbox}>
          <button type="button" className="bu-lightbox-close" onClick={closeLightbox} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <img
            src={lightbox.url}
            alt={altTextStates[lightbox.index]?.text || selectedFiles[lightbox.index]?.name}
            className="bu-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="bu-lightbox-name">{selectedFiles[lightbox.index]?.name}</p>
        </div>
      )}
    </div>
  )
}
