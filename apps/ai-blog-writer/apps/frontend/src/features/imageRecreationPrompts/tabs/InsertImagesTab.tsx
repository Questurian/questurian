import { useEffect, useRef, useState } from 'react'
import {
  buildImageInsertPrompt,
  describeImageScene,
  describeImageSubject,
  type InsertImage,
} from '../../../shared/images/api/analysis-prompts/image-analysis-prompts.api'

type InsertEntry = {
  id: string
  file: File
  previewUrl: string
  description: string
  isDescribing: boolean
  error: string | null
}

type CopyTarget = 'scene' | 'edit-prompt' | null

export default function InsertImagesTab() {
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [mainPreviewUrl, setMainPreviewUrl] = useState<string | null>(null)

  const [sceneDescription, setSceneDescription] = useState<string | null>(null)
  const [isDescribingScene, setIsDescribingScene] = useState(false)
  const [sceneError, setSceneError] = useState<string | null>(null)

  const [inserts, setInserts] = useState<InsertEntry[]>([])

  const [placement, setPlacement] = useState('')
  const [editPrompt, setEditPrompt] = useState<string | null>(null)
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  const [copied, setCopied] = useState<CopyTarget>(null)

  const nextId = useRef(0)

  useEffect(() => {
    if (!mainFile) {
      setMainPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(mainFile)
    setMainPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [mainFile])

  // Revoke any remaining insert preview URLs on unmount.
  const insertsRef = useRef(inserts)
  insertsRef.current = inserts
  useEffect(() => {
    return () => {
      insertsRef.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl))
    }
  }, [])

  const handleMainFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setMainFile(selected)
    setSceneDescription(null)
    setSceneError(null)
    setEditPrompt(null)
    setBuildError(null)
    setCopied(null)
  }

  const handleDescribeScene = async () => {
    if (!mainFile) return
    setIsDescribingScene(true)
    setSceneError(null)
    setSceneDescription(null)
    setEditPrompt(null)
    setBuildError(null)
    setCopied(null)
    try {
      const result = await describeImageScene(mainFile)
      setSceneDescription(result)
    } catch (err) {
      setSceneError(err instanceof Error ? err.message : 'Failed to describe scene')
    } finally {
      setIsDescribingScene(false)
    }
  }

  const describeInsert = async (id: string, file: File) => {
    setInserts((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, isDescribing: true, error: null } : entry,
      ),
    )
    try {
      const description = await describeImageSubject(file)
      setInserts((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, description, isDescribing: false } : entry,
        ),
      )
    } catch (err) {
      setInserts((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                isDescribing: false,
                error: err instanceof Error ? err.message : 'Failed to describe subject',
              }
            : entry,
        ),
      )
    }
  }

  const handleAddInserts = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // Reset the input so the same file can be re-selected later.
    event.target.value = ''
    if (files.length === 0) return

    const newEntries: InsertEntry[] = files.map((file) => ({
      id: `insert-${nextId.current++}`,
      file,
      previewUrl: URL.createObjectURL(file),
      description: '',
      isDescribing: true,
      error: null,
    }))

    setInserts((current) => [...current, ...newEntries])
    setEditPrompt(null)
    setBuildError(null)
    newEntries.forEach((entry) => {
      void describeInsert(entry.id, entry.file)
    })
  }

  const handleRemoveInsert = (id: string) => {
    setInserts((current) => {
      const target = current.find((entry) => entry.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((entry) => entry.id !== id)
    })
    setEditPrompt(null)
  }

  const handleInsertDescriptionChange = (id: string, value: string) => {
    setInserts((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, description: value } : entry)),
    )
  }

  const anyInsertDescribing = inserts.some((entry) => entry.isDescribing)
  const canBuild =
    !!mainFile &&
    !!sceneDescription &&
    inserts.length > 0 &&
    !anyInsertDescribing &&
    !isBuilding

  const handleBuild = async () => {
    if (!mainFile || !sceneDescription || inserts.length === 0) return
    setIsBuilding(true)
    setBuildError(null)
    setEditPrompt(null)
    setCopied(null)
    try {
      const insertPayload: InsertImage[] = inserts.map((entry) => ({
        file: entry.file,
        description: entry.description.trim(),
      }))
      const result = await buildImageInsertPrompt(
        mainFile,
        sceneDescription,
        insertPayload,
        placement.trim(),
      )
      setEditPrompt(result)
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to build insert prompt')
    } finally {
      setIsBuilding(false)
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
        Step 1 — upload the main scene image and describe it.
        Step 2 — add one or more images whose subjects should be inserted (each is
        auto-described). Step 3 — say where they go and get a ready-to-paste edit prompt.
      </p>

      {/* Step 1 — main image */}
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>1. Main scene image</h2>
      <div style={{ marginBottom: 16 }}>
        <input type="file" accept="image/*" onChange={handleMainFileChange} />
      </div>

      {mainPreviewUrl && (
        <div style={{ marginBottom: 16 }}>
          <img
            src={mainPreviewUrl}
            alt="Main scene preview"
            style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, border: '1px solid #ddd' }}
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={handleDescribeScene}
          disabled={!mainFile || isDescribingScene}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #333',
            background: isDescribingScene ? '#eee' : '#fff',
            cursor: !mainFile || isDescribingScene ? 'not-allowed' : 'pointer',
          }}
        >
          {isDescribingScene ? 'Describing scene…' : 'Describe main scene'}
        </button>
      </div>

      {sceneError && (
        <div style={{ padding: 12, borderRadius: 6, background: '#fee', color: '#900', marginBottom: 16 }}>
          {sceneError}
        </div>
      )}

      {sceneDescription && (
        <div style={{ padding: 12, borderRadius: 6, background: '#f4f4f4', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#666' }}>Main scene description</div>
            <button
              type="button"
              onClick={() => handleCopy('scene', sceneDescription)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #999',
                background: '#fff',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {copied === 'scene' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            value={sceneDescription}
            onChange={(event) => setSceneDescription(event.target.value)}
            rows={5}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontFamily: 'inherit',
              fontSize: 14,
              boxSizing: 'border-box',
              resize: 'vertical',
              background: '#fff',
            }}
          />
        </div>
      )}

      {/* Step 2 — insert images */}
      {sceneDescription && (
        <>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>2. Images to insert</h2>
          <p style={{ marginTop: 0, marginBottom: 12, color: '#666', fontSize: 13 }}>
            Add the people or objects you want dropped into the main scene. Each image is
            auto-described — edit the description if it gets anything wrong.
          </p>
          <div style={{ marginBottom: 16 }}>
            <input type="file" accept="image/*" multiple onChange={handleAddInserts} />
          </div>

          {inserts.map((entry, index) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: 12,
                padding: 12,
                marginBottom: 12,
                borderRadius: 6,
                border: '1px solid #e2e2e2',
                background: '#fafafa',
              }}
            >
              <img
                src={entry.previewUrl}
                alt={`Insert ${index + 1} preview`}
                style={{
                  width: 96,
                  height: 96,
                  objectFit: 'cover',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Insert {index + 1}
                    {entry.isDescribing ? ' — describing…' : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveInsert(entry.id)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid #c99',
                      background: '#fff',
                      color: '#900',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Remove
                  </button>
                </div>
                {entry.error && (
                  <div style={{ fontSize: 12, color: '#900', marginBottom: 6 }}>
                    {entry.error}{' '}
                    <button
                      type="button"
                      onClick={() => describeInsert(entry.id, entry.file)}
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: '1px solid #999',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}
                <textarea
                  value={entry.description}
                  onChange={(event) => handleInsertDescriptionChange(entry.id, event.target.value)}
                  placeholder={entry.isDescribing ? 'Describing subject…' : 'Description of the subject to insert'}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          ))}
        </>
      )}

      {/* Step 3 — placement + build */}
      {sceneDescription && inserts.length > 0 && (
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>3. Where do they go?</h2>
          <textarea
            value={placement}
            onChange={(event) => setPlacement(event.target.value)}
            placeholder="e.g. Seat the group of people around the table in the foreground, facing the camera. Leave blank to let the model choose a natural placement."
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
              onClick={handleBuild}
              disabled={!canBuild}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #333',
                background: isBuilding ? '#eee' : '#fff',
                cursor: canBuild ? 'pointer' : 'not-allowed',
              }}
            >
              {isBuilding ? 'Building insert prompt…' : 'Build insert prompt'}
            </button>
            {anyInsertDescribing && (
              <span style={{ marginLeft: 10, fontSize: 12, color: '#666' }}>
                Waiting for subject descriptions…
              </span>
            )}
          </div>
        </div>
      )}

      {buildError && (
        <div style={{ padding: 12, borderRadius: 6, background: '#fee', color: '#900', marginBottom: 16 }}>
          {buildError}
        </div>
      )}

      {editPrompt && (
        <div style={{ padding: 12, borderRadius: 6, background: '#eef6ff', border: '1px solid #cbd9eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#345' }}>
              Insert prompt (paste this with the main image + insert images into your editor)
            </div>
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
