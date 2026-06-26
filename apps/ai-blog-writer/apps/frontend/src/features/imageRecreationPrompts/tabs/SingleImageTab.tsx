import { useEffect, useState } from 'react'
import {
  buildImageEditPrompt,
  describeImageScene,
} from '../../../shared/images/api/imagesApi'

type CopyTarget = 'description' | 'edit-prompt' | null

export default function SingleImageTab() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [description, setDescription] = useState<string | null>(null)
  const [isDescribing, setIsDescribing] = useState(false)
  const [describeError, setDescribeError] = useState<string | null>(null)

  const [changeRequest, setChangeRequest] = useState('')
  const [editPrompt, setEditPrompt] = useState<string | null>(null)
  const [isBuildingEdit, setIsBuildingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [copied, setCopied] = useState<CopyTarget>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const resetDownstream = () => {
    setDescription(null)
    setDescribeError(null)
    setChangeRequest('')
    setEditPrompt(null)
    setEditError(null)
    setCopied(null)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
    resetDownstream()
  }

  const handleDescribe = async () => {
    if (!file) return
    setIsDescribing(true)
    setDescribeError(null)
    setDescription(null)
    setEditPrompt(null)
    setEditError(null)
    setCopied(null)
    try {
      const result = await describeImageScene(file)
      setDescription(result)
    } catch (err) {
      setDescribeError(err instanceof Error ? err.message : 'Failed to describe scene')
    } finally {
      setIsDescribing(false)
    }
  }

  const handleBuildEditPrompt = async () => {
    if (!file || !description || !changeRequest.trim()) return
    setIsBuildingEdit(true)
    setEditError(null)
    setEditPrompt(null)
    setCopied(null)
    try {
      const result = await buildImageEditPrompt(file, description, changeRequest.trim())
      setEditPrompt(result)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to build edit prompt')
    } finally {
      setIsBuildingEdit(false)
    }
  }

  const handleCopy = async (target: Exclude<CopyTarget, null>, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(target)
    setTimeout(() => setCopied((current) => (current === target ? null : current)), 1500)
  }

  return (
    <div>
      <p style={{ marginTop: 0, marginBottom: 16, color: '#666', fontSize: 14 }}>
        Step 1 — upload an image and get a mise-en-scène description.
        Step 2 — describe what you want changed and get a ready-to-paste edit prompt.
      </p>

      <div style={{ marginBottom: 16 }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      {previewUrl && (
        <div style={{ marginBottom: 16 }}>
          <img
            src={previewUrl}
            alt="Selected preview"
            style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, border: '1px solid #ddd' }}
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={handleDescribe}
          disabled={!file || isDescribing}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #333',
            background: isDescribing ? '#eee' : '#fff',
            cursor: !file || isDescribing ? 'not-allowed' : 'pointer',
          }}
        >
          {isDescribing ? 'Describing scene…' : '1. Describe scene'}
        </button>
      </div>

      {describeError && (
        <div style={{ padding: 12, borderRadius: 6, background: '#fee', color: '#900', marginBottom: 16 }}>
          {describeError}
        </div>
      )}

      {description && (
        <div style={{ padding: 12, borderRadius: 6, background: '#f4f4f4', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#666' }}>Scene description</div>
            <button
              type="button"
              onClick={() => handleCopy('description', description)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #999',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {copied === 'description' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{description}</div>
        </div>
      )}

      {description && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>What do you want changed?</h2>
          <textarea
            value={changeRequest}
            onChange={(event) => setChangeRequest(event.target.value)}
            placeholder="e.g. Replace the wooden chair with a black leather armchair, and add a small dog sleeping on the rug."
            rows={4}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontFamily: 'inherit',
              fontSize: 14,
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={handleBuildEditPrompt}
              disabled={!changeRequest.trim() || isBuildingEdit}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #333',
                background: isBuildingEdit ? '#eee' : '#fff',
                cursor: !changeRequest.trim() || isBuildingEdit ? 'not-allowed' : 'pointer',
              }}
            >
              {isBuildingEdit ? 'Building edit prompt…' : '2. Build edit prompt'}
            </button>
          </div>
        </div>
      )}

      {editError && (
        <div style={{ padding: 12, borderRadius: 6, background: '#fee', color: '#900', marginBottom: 16 }}>
          {editError}
        </div>
      )}

      {editPrompt && (
        <div style={{ padding: 12, borderRadius: 6, background: '#eef6ff', border: '1px solid #cbd9eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#345' }}>Edit prompt (paste this with your image into your editor)</div>
            <button
              type="button"
              onClick={() => handleCopy('edit-prompt', editPrompt)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #6b8db5',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {copied === 'edit-prompt' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{editPrompt}</div>
        </div>
      )}
    </div>
  )
}
