import { useState, useRef, useCallback } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { MultiVariantCropper } from '../../images/components/MultiVariantCropper'
import { generateAltText, uploadImageVariants, resolveTagsByName } from '../../images/api/imagesApi'
import { validateImageFile } from '../../images/validators/image-upload.validators'
import { parsePhotographerFromFilename, parseSeriesSlugFromFilename } from '../../images/utils/imageProcessing'
import type { ImageVariantType } from '../../images/utils/imageProcessing'
import { useAuth } from '../../../providers/useAuth'
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

function sanitizeExternalRef(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

function parseMetaFromFilename(filename: string): ImageMeta {
  const credit = parsePhotographerFromFilename(filename) ?? ''
  const seriesSlug = parseSeriesSlugFromFilename(filename)
  return { credit, tagNames: seriesSlug ? [seriesSlug] : [] }
}

export function BatchUploadPage() {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [imageMetas, setImageMetas] = useState<ImageMeta[]>([])
  const [altTextStates, setAltTextStates] = useState<AltTextState[]>([])
  const [processedSets, setProcessedSets] = useState<(ProcessedSet | null)[]>([])
  const [uploadStates, setUploadStates] = useState<UploadState[]>([])
  const [cropModal, setCropModal] = useState<CropModalState>({ open: false, index: null })
  const [isDragging, setIsDragging] = useState(false)
  const [isUploadingAll, setIsUploadingAll] = useState(false)

  // ── File Selection ─────────────────────────────────────────────────────────

  function startAltTextGeneration(file: File, index: number) {
    generateAltText(file)
      .then((text) => {
        setAltTextStates((prev) => {
          const next = [...prev]
          next[index] = { status: 'done', text }
          return next
        })
      })
      .catch(() => {
        setAltTextStates((prev) => {
          const next = [...prev]
          next[index] = { status: 'error', text: '' }
          return next
        })
      })
  }

  function handleFileSelect(incoming: FileList | null) {
    if (!incoming) return
    const valid: File[] = []
    for (const file of Array.from(incoming)) {
      const err = validateImageFile(file)
      if (!err) valid.push(file)
    }
    if (valid.length === 0) return

    const startIndex = selectedFiles.length

    setSelectedFiles((prev) => [...prev, ...valid])
    setImageMetas((prev) => [...prev, ...valid.map((f) => parseMetaFromFilename(f.name))])
    setAltTextStates((prev) => [...prev, ...valid.map(() => ({ status: 'loading' as const, text: '' }))])
    setProcessedSets((prev) => [...prev, ...Array(valid.length).fill(null)])
    setUploadStates((prev) => [...prev, ...valid.map(() => ({ status: 'idle' as const, progress: 0, message: '' }))])

    // Kick off alt text generation for each new file in parallel
    valid.forEach((file, j) => startAltTextGeneration(file, startIndex + j))

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setImageMetas((prev) => prev.filter((_, i) => i !== index))
    setAltTextStates((prev) => prev.filter((_, i) => i !== index))
    setProcessedSets((prev) => prev.filter((_, i) => i !== index))
    setUploadStates((prev) => prev.filter((_, i) => i !== index))
    if (cropModal.index === index) setCropModal({ open: false, index: null })
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

    setProcessedSets((prev) => {
      const next = [...prev]
      next[idx] = { variantFiles }
      const nextUncropped = findNextUnprocessed(idx + 1, next)
      if (nextUncropped !== null) {
        setCropModal({ open: true, index: nextUncropped })
      } else {
        setCropModal({ open: false, index: null })
      }
      return next
    })
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
          undefined,
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
    setSelectedFiles([])
    setImageMetas([])
    setAltTextStates([])
    setProcessedSets([])
    setUploadStates([])
    setCropModal({ open: false, index: null })
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const allCropped = selectedFiles.length > 0 && processedSets.every((s) => s !== null)
  const croppedCount = processedSets.filter(Boolean).length
  const allHaveCredit = imageMetas.length > 0 && imageMetas.every((m) => m.credit.trim().length > 0)
  const allAltTextDone = altTextStates.length > 0 && altTextStates.every((s) => s.status !== 'loading')
  const canUpload = allCropped && allHaveCredit && allAltTextDone && !isUploadingAll
  const anyUploaded = uploadStates.some((s) => s.status === 'success')
  const showDropZone = selectedFiles.length === 0 || anyUploaded

  // ── Crop mode — full-screen takeover ──────────────────────────────────────

  if (cropModal.open && cropModal.index !== null) {
    return (
      <div className="bu-page">
        <MultiVariantCropper
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
                const previewUrl = URL.createObjectURL(file)

                return (
                  <div key={`${file.name}-${i}`} className={`bu-image-card${isCropped ? ' bu-image-card--cropped' : ''}`}>
                    <div className="bu-image-thumb-wrap">
                      <img src={previewUrl} alt={altState?.text || file.name} className="bu-image-thumb" />

                      {/* Alt text status — top left */}
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
                        <span className="bu-alt-badge bu-alt-badge--error" title="Alt text failed — will upload without">
                          !
                        </span>
                      )}

                      {/* Crop done — top right */}
                      {isCropped && (
                        <span className="bu-crop-badge" title="Cropped">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </span>
                      )}

                      {/* Upload success */}
                      {uploadState?.status === 'success' && (
                        <span className="bu-success-badge" title="Uploaded">✓</span>
                      )}
                    </div>

                    <p className="bu-image-name" title={file.name}>{file.name}</p>

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

            <div className="bu-actions" style={{ marginTop: '1.25rem' }}>
              <button type="button" className="bu-btn-primary bu-btn-upload"
                onClick={() => void handleUploadAll()}
                disabled={!canUpload}>
                {isUploadingAll
                  ? 'Uploading...'
                  : !allAltTextDone
                    ? 'Generating alt text...'
                    : allCropped
                      ? `Upload All (${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''})`
                      : `Crop ${selectedFiles.length - croppedCount} more to continue`}
              </button>
              <button type="button" className="bu-btn-secondary" onClick={handleReset} disabled={isUploadingAll}>
                Clear All
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
