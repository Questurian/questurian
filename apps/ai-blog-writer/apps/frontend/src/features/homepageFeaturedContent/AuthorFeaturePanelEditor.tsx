import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { payloadRequest } from '../../shared/api/client/http'
import {
  AuthorImagePlacementEditor,
  mediaSetPreviewUrl,
  type Author,
  type AuthorImageEntry
} from '../staff'
import type { AuthorFeatureBlockResponse } from './pageBlocks'
import type { AuthorFeatureFieldsUpdate } from './mainHomepage/blocks/blockSettings.api'

type DraftAuthorSelection = {
  authorId: number
  image: number | null
  spotlightNote: string
}

type Props = {
  block: AuthorFeatureBlockResponse
  canManage: boolean
  saveFields: (fields: AuthorFeatureFieldsUpdate) => Promise<void>
}

async function fetchAuthorsWithImages(): Promise<Author[]> {
  const response = (await payloadRequest(
    '/api/authors?limit=200&sort=displayName&depth=2'
  )) as { docs?: Author[] }
  return response.docs ?? []
}

function mediaSetId(entry: AuthorImageEntry): number {
  return typeof entry.mediaSet === 'number' ? entry.mediaSet : entry.mediaSet.id
}

function mediaSetTitle(entry: AuthorImageEntry): string {
  const id = mediaSetId(entry)
  return typeof entry.mediaSet === 'number'
    ? `Image #${id}`
    : entry.mediaSet.title || `Image #${id}`
}

function initialAuthor(
  block: AuthorFeatureBlockResponse
): DraftAuthorSelection | null {
  const card = block.authorCard
  return card
    ? {
        authorId: card.author.id,
        image: card.imageMediaSetId,
        spotlightNote: card.spotlightNote ?? ''
      }
    : null
}

function editableImageStyle(
  block: AuthorFeatureBlockResponse
): AuthorFeatureBlockResponse['imageStyle'] {
  return block.imageStyle
}

function fieldsSignature(block: AuthorFeatureBlockResponse): string {
  return JSON.stringify({
    imageStyle: editableImageStyle(block),
    author: initialAuthor(block)
  })
}

function fieldsFromDraft(
  draftAuthor: DraftAuthorSelection,
  imageStyle: AuthorFeatureBlockResponse['imageStyle']
): AuthorFeatureFieldsUpdate {
  return {
    imageStyle,
    authorCards: [
      {
        author: draftAuthor.authorId,
        image: draftAuthor.image,
        spotlightNote: draftAuthor.spotlightNote.trim() || null
      }
    ]
  }
}

export default function AuthorFeaturePanelEditor({
  block,
  canManage,
  saveFields
}: Props) {
  const [draftAuthor, setDraftAuthor] = useState(() => initialAuthor(block))
  const [imageStyle, setImageStyle] = useState(() => editableImageStyle(block))
  const [hydratedSignature, setHydratedSignature] = useState(() =>
    fieldsSignature(block)
  )
  const [settingsOpen, setSettingsOpen] = useState(
    () => !block.authorCard || block.authorCard.imageMediaSetId === null
  )

  const authorsQuery = useQuery({
    queryKey: ['homepage-author-feature-authors'],
    queryFn: fetchAuthorsWithImages,
    enabled: canManage
  })

  useEffect(() => {
    const nextSignature = fieldsSignature(block)
    if (nextSignature === hydratedSignature) return
    setDraftAuthor(initialAuthor(block))
    setImageStyle(editableImageStyle(block))
    setHydratedSignature(nextSignature)
  }, [block, hydratedSignature])

  const authors = useMemo(() => authorsQuery.data ?? [], [authorsQuery.data])
  const authorsById = useMemo(
    () => new Map(authors.map((candidate) => [candidate.id, candidate])),
    [authors]
  )
  const selectedAuthor = draftAuthor
    ? authorsById.get(draftAuthor.authorId)
    : undefined
  const savedAuthor = block.authorCard
  const authorImages = selectedAuthor?.authorImages ?? []
  const selectedImage = authorImages.find(
    (entry) => mediaSetId(entry) === draftAuthor?.image
  )
  const currentFields = (): AuthorFeatureFieldsUpdate =>
    draftAuthor ? fieldsFromDraft(draftAuthor, imageStyle) : { imageStyle }

  const saveMutation = useMutation({
    mutationFn: () => saveFields(currentFields()),
    onSuccess: () => setSettingsOpen(false)
  })

  function selectAuthor(authorId: string) {
    const id = Number(authorId)
    setDraftAuthor(
      authorsById.has(id)
        ? { authorId: id, image: null, spotlightNote: '' }
        : null
    )
  }

  return (
    <details
      className="hf-editorial-feature-disclosure"
      open={settingsOpen}
      onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
    >
      <summary>Author feature panel</summary>
      <div className="hf-editorial-feature-fields hf-author-feature-fields">
        <p className="hf-panel-desc">
          Choose one Author and one of their profile images, then set focal
          placement for portrait, square, and wide crops.
        </p>

        <div className="hf-editorial-feature-field-grid">
          <label className="is-wide">
            <span>Author</span>
            <select
              value={draftAuthor?.authorId ?? ''}
              disabled={!canManage || authorsQuery.isLoading}
              onChange={(event) => selectAuthor(event.target.value)}
            >
              <option value="">Choose Author</option>
              {savedAuthor && !authorsById.has(savedAuthor.author.id) ? (
                <option value={savedAuthor.author.id}>
                  {savedAuthor.author.name ||
                    `Author #${savedAuthor.author.id}`}
                </option>
              ) : null}
              {authors.map((candidate) => {
                const imageCount = candidate.authorImages?.length ?? 0
                return (
                  <option
                    key={candidate.id}
                    value={candidate.id}
                    disabled={imageCount === 0}
                  >
                    {candidate.displayName}
                    {imageCount === 0 ? ' · no feature images' : ''}
                  </option>
                )
              })}
            </select>
          </label>

          <label className="is-wide">
            <span>Portrait treatment</span>
            <select
              value={imageStyle}
              disabled={!canManage}
              onChange={(event) =>
                setImageStyle(event.target.value as typeof imageStyle)
              }
            >
              <option value="portrait">Portrait · full bleed</option>
              <option value="square">Square · blue offset</option>
              <option value="circle">Circle · blue offset</option>
            </select>
          </label>
        </div>

        {draftAuthor ? (
          <section
            className="hf-author-feature-card-editor"
            aria-label={
              selectedAuthor?.displayName ??
              savedAuthor?.author.name ??
              `Author #${draftAuthor.authorId}`
            }
          >
            <header className="hf-author-feature-card-header">
              <div>
                <small>Featured Author</small>
                <strong>
                  {selectedAuthor?.displayName ??
                    savedAuthor?.author.name ??
                    `Author #${draftAuthor.authorId}`}
                </strong>
              </div>
            </header>

            <fieldset className="hf-author-feature-image-fieldset">
              <legend>Choose exact image</legend>
              {authorsQuery.isLoading ? (
                <p className="staff-muted">Loading Author images…</p>
              ) : authorImages.length ? (
                <div className="hf-author-feature-image-picker">
                  {authorImages.map((entry) => {
                    const id = mediaSetId(entry)
                    const preview = mediaSetPreviewUrl(entry.mediaSet)
                    const title = mediaSetTitle(entry)
                    const isSelected = id === draftAuthor.image
                    return (
                      <button
                        type="button"
                        key={id}
                        className={`hf-author-feature-image-option${isSelected ? ' is-selected' : ''}`}
                        aria-label={`Use ${title}`}
                        aria-pressed={isSelected}
                        disabled={!canManage}
                        onClick={() =>
                          setDraftAuthor((current) =>
                            current ? { ...current, image: id } : current
                          )
                        }
                      >
                        {preview ? <img src={preview} alt="" /> : null}
                        <span>{title}</span>
                        <small>{isSelected ? 'Selected' : 'Choose'}</small>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="hf-banner error">
                  This Author has no uploaded Author Feature images. Add one on
                  their profile first.
                </p>
              )}
            </fieldset>

            {authorImages.length > 0 && draftAuthor.image === null ? (
              <p className="hf-banner error">
                Choose one of this Author’s uploaded images.
              </p>
            ) : null}

            {selectedImage ? (
              <AuthorImagePlacementEditor
                mediaSet={selectedImage.mediaSet}
                disabled={!canManage}
                onSaved={() => saveFields(currentFields())}
              />
            ) : null}

            <label className="hf-author-feature-note">
              <span>
                Homepage note · {draftAuthor.spotlightNote.length}/160
              </span>
              <textarea
                value={draftAuthor.spotlightNote}
                maxLength={160}
                disabled={!canManage}
                placeholder="e.g. Local expat"
                onChange={(event) =>
                  setDraftAuthor((current) =>
                    current
                      ? { ...current, spotlightNote: event.target.value }
                      : current
                  )
                }
              />
            </label>
          </section>
        ) : null}

        <button
          type="button"
          className="hf-btn-primary"
          disabled={
            !canManage ||
            saveMutation.isPending ||
            !draftAuthor ||
            draftAuthor.image === null
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Author feature'}
        </button>
        {saveMutation.error ? (
          <p className="hf-banner error">{saveMutation.error.message}</p>
        ) : null}
      </div>
    </details>
  )
}
