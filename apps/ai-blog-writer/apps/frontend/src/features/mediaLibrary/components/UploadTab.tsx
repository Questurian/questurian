import { useCallback, useRef, useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLocations } from '../../../shared/api/payload/payload.api'
import { generateAltText, uploadImage } from '../../../shared/images/api/imagesApi'
import type { UploadProgress } from '../../../shared/images/api/imagesApi'

type Props = { token: string }

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: UploadProgress }
  | { status: 'success'; mediaSetId: string }
  | { status: 'error'; message: string }

type AltState = { status: 'idle' | 'generating' | 'done' | 'error'; text: string }

function sanitizeRef(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .toLowerCase()
}

export function UploadTab({ token }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [altState, setAltState] = useState<AltState>({ status: 'idle', text: '' })
  const [credit, setCredit] = useState('')
  const [locationRef, setLocationRef] = useState<number | ''>('')
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(token),
    enabled: !!token,
  })
  const locations = locationsData?.docs ?? []

  const acceptFile = useCallback((f: File) => {
    setFile(f)
    setUploadState({ status: 'idle' })
    setAltState({ status: 'idle', text: '' })

    const objectUrl = URL.createObjectURL(f)
    setPreview(objectUrl)

    setAltState({ status: 'generating', text: '' })
    generateAltText(f)
      .then((text) => setAltState({ status: 'done', text }))
      .catch(() => setAltState({ status: 'error', text: '' }))
  }, [])

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) acceptFile(f)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) acceptFile(f)
  }

  const handleUpload = async () => {
    if (!file || !locationRef) return

    const externalRef = sanitizeRef(file.name)
    const altText = altState.text.trim()
    if (!altText) return

    setUploadState({ status: 'uploading', progress: { status: 'uploading', progress: 0, message: 'Starting…' } })

    try {
      const result = await uploadImage(
        file,
        externalRef,
        altText,
        Number(locationRef),
        token,
        credit.trim(),
        (progress) => setUploadState({ status: 'uploading', progress }),
      )
      setUploadState({ status: 'success', mediaSetId: result.mediaSetId ?? '' })
      setFile(null)
      setPreview(null)
      setCredit('')
      setLocationRef('')
      setAltState({ status: 'idle', text: '' })
    } catch (err) {
      setUploadState({ status: 'error', message: String(err) })
    }
  }

  const canUpload =
    !!file &&
    altState.text.trim() &&
    !!locationRef &&
    uploadState.status !== 'uploading'

  return (
    <div className="ml-upload">
      {uploadState.status === 'success' && (
        <div className="ml-upload-success">
          ✅ MediaSet created successfully.{' '}
          <button type="button" className="ml-link-btn" onClick={() => setUploadState({ status: 'idle' })}>
            Upload another
          </button>
        </div>
      )}

      {!file ? (
        <div
          className={`ml-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <span className="ml-dropzone-icon">📷</span>
          <p>Drop an image here or click to browse</p>
          <p className="ml-dropzone-hint">JPEG, PNG, WebP — max 25 MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onFileChange}
            className="ml-file-input-hidden"
          />
        </div>
      ) : (
        <div className="ml-upload-form">
          <div className="ml-upload-preview-col">
            {preview && (
              <img className="ml-upload-preview" src={preview} alt="Preview" />
            )}
            <p className="ml-upload-filename">{file.name}</p>
            <button
              type="button"
              className="ml-link-btn"
              onClick={() => {
                setFile(null)
                setPreview(null)
                setAltState({ status: 'idle', text: '' })
                setUploadState({ status: 'idle' })
              }}
            >
              Choose a different file
            </button>
          </div>

          <div className="ml-upload-fields-col">
            <label className="ml-field-label">
              Alt text
              {altState.status === 'generating' && (
                <span className="ml-generating"> ✨ Generating…</span>
              )}
              <textarea
                className="ml-field-input ml-field-textarea"
                value={altState.text}
                onChange={(e) => setAltState((s) => ({ ...s, text: e.target.value }))}
                rows={3}
                placeholder="Describe the image…"
              />
            </label>

            <label className="ml-field-label">
              Photographer credit
              <input
                className="ml-field-input"
                type="text"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder="Photographer name or source"
              />
            </label>

            <label className="ml-field-label">
              Location <span className="ml-required">*</span>
              <select
                className="ml-field-input"
                value={locationRef}
                onChange={(e) => setLocationRef(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— select a location —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.neighborhood
                      ? `${l.neighborhood}, ${l.city}`
                      : l.city
                      ? `${l.city}, ${l.country}`
                      : l.country}
                  </option>
                ))}
              </select>
            </label>

            {uploadState.status === 'uploading' && (
              <div className="ml-upload-progress">
                <div
                  className="ml-upload-progress-bar"
                  style={{ width: `${uploadState.progress.progress}%` }}
                />
                <span>{uploadState.progress.message}</span>
              </div>
            )}

            {uploadState.status === 'error' && (
              <div className="ml-field-error">{uploadState.message}</div>
            )}

            <button
              type="button"
              className="ml-save-btn"
              onClick={handleUpload}
              disabled={!canUpload}
            >
              {uploadState.status === 'uploading' ? 'Uploading…' : 'Upload & create MediaSet'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
