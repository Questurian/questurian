import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { generateFluxEditedImage } from '../images'
import { useAuth } from '../../providers/useAuth'
import { FLUX_MODEL_OPTIONS } from '../imageRecreationPrompts/config'

const MAX_IMAGES = 8 // 1 primary + 7 additional (API limit)

export default function BatchImageRecreationPage() {
  const { token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('flux-2-pro-preview')
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<{ url: string; fileName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke result URL on unmount
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url)
    }
  }, [result])

  const addFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    setReferenceImages((prev) => {
      const combined = [...prev, ...imageFiles].slice(0, MAX_IMAGES)
      return combined
    })
    setImagePreviews((prev) => {
      const newPreviews = imageFiles.map((f) => URL.createObjectURL(f))
      const combined = [...prev, ...newPreviews].slice(0, MAX_IMAGES)
      // Revoke extras if we exceeded the limit
      newPreviews.slice(MAX_IMAGES - prev.length).forEach((url) => URL.revokeObjectURL(url))
      return combined
    })
    setResult(null)
    setError(null)
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
      e.target.value = ''
    }
  }, [addFiles])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }, [addFiles])

  const handleRemove = useCallback((index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
    setResult(null)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!token || referenceImages.length === 0 || !prompt.trim() || isGenerating) return
    setIsGenerating(true)
    setError(null)
    if (result) {
      URL.revokeObjectURL(result.url)
      setResult(null)
    }
    try {
      const response = await generateFluxEditedImage(
        prompt.trim(),
        referenceImages[0],
        token,
        {
          additionalReferenceImages: referenceImages.slice(1),
          modelId,
        }
      )
      setResult({ url: URL.createObjectURL(response.blob), fileName: response.fileName })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [token, referenceImages, prompt, modelId, isGenerating, result])

  const canGenerate = referenceImages.length > 0 && prompt.trim().length > 0 && !isGenerating && Boolean(token)
  const atLimit = referenceImages.length >= MAX_IMAGES

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Link
          to="/"
          style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}
        >
          ← Back
        </Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Batch Image Recreation</h1>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !atLimit && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#4a90e2' : '#ccc'}`,
          borderRadius: 10,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: atLimit ? 'not-allowed' : 'pointer',
          background: isDragging ? '#f0f6ff' : '#fafafa',
          transition: 'border-color 0.15s, background 0.15s',
          marginBottom: 24,
          opacity: atLimit ? 0.5 : 1,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />
        <div style={{ fontSize: 36, marginBottom: 8 }}>🖼️</div>
        {atLimit ? (
          <p style={{ margin: 0, color: '#888' }}>Maximum {MAX_IMAGES} images reached</p>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 600, color: '#333' }}>
              Drop images here or click to browse
            </p>
            <p style={{ margin: '6px 0 0', color: '#888', fontSize: 13 }}>
              Accepts any image format · Up to {MAX_IMAGES} images total
            </p>
          </>
        )}
      </div>

      {/* Image thumbnails */}
      {referenceImages.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666', fontWeight: 500 }}>
            {referenceImages.length} image{referenceImages.length !== 1 ? 's' : ''} selected
            {referenceImages.length > 1 ? ` · first is primary reference, rest are additional` : ''}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {imagePreviews.map((src, i) => (
              <div
                key={i}
                style={{
                  position: 'relative',
                  width: 120,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '2px solid',
                  borderColor: i === 0 ? '#4a90e2' : '#ddd',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                }}
              >
                <img
                  src={src}
                  alt={`Reference ${i + 1}`}
                  style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
                />
                {i === 0 && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(74,144,226,0.85)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                    textAlign: 'center',
                    padding: '3px 0',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}>
                    Primary
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(i) }}
                  title="Remove"
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe the desired output image..."
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1.5px solid #ddd',
            fontSize: 14,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
      </div>

      {/* Model selector */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
          Model
        </label>
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1.5px solid #ddd',
            fontSize: 14,
            background: '#fff',
            cursor: 'pointer',
            minWidth: 220,
          }}
        >
          {FLUX_MODEL_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Generate button */}
      <button
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        style={{
          padding: '12px 32px',
          borderRadius: 8,
          border: 'none',
          background: canGenerate ? '#4a90e2' : '#bbb',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
        }}
      >
        {isGenerating ? 'Generating…' : 'Generate'}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: '#fff2f2',
          border: '1px solid #fcc',
          color: '#c00',
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {isGenerating && (
        <div style={{ marginTop: 20, color: '#666', fontSize: 14 }}>
          Generating with {FLUX_MODEL_OPTIONS.find((o) => o.id === modelId)?.label ?? modelId}…
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Result</h2>
          <img
            src={result.url}
            alt="Generated result"
            style={{
              maxWidth: '100%',
              borderRadius: 10,
              border: '1px solid #eee',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              display: 'block',
              marginBottom: 16,
            }}
          />
          <a
            href={result.url}
            download={result.fileName}
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              borderRadius: 8,
              background: '#333',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Download
          </a>
        </div>
      )}
    </div>
  )
}
