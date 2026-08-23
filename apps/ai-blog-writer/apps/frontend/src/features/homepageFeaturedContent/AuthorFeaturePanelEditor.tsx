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

type DraftCard = {
  author: number
  image: number | null
  spotlightNote: string
  isEmphasized: boolean
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

function initialCards(block: AuthorFeatureBlockResponse): DraftCard[] {
  return block.authorCards.map((card) => ({
    author: card.author.id,
    image: card.imageMediaSetId,
    spotlightNote: card.spotlightNote ?? '',
    isEmphasized: card.isEmphasized
  }))
}

function editableImageStyle(
  block: AuthorFeatureBlockResponse
): AuthorFeatureBlockResponse['imageStyle'] {
  return block.authorCards.length <= 1 && block.imageStyle === 'mixed'
    ? 'portrait'
    : block.imageStyle
}

function fieldsSignature(block: AuthorFeatureBlockResponse): string {
  return JSON.stringify({
    imageStyle: editableImageStyle(block),
    authorCards: initialCards(block)
  })
}

function fieldsFromDraft(
  cards: DraftCard[],
  imageStyle: AuthorFeatureBlockResponse['imageStyle']
): AuthorFeatureFieldsUpdate {
  return {
    imageStyle,
    authorCards: cards.map((card, index) => ({
      author: card.author,
      image: card.image,
      spotlightNote: card.spotlightNote.trim() || null,
      isEmphasized: cards.some((candidate) => candidate.isEmphasized)
        ? card.isEmphasized
        : index === 0
    }))
  }
}

export default function AuthorFeaturePanelEditor({
  block,
  canManage,
  saveFields
}: Props) {
  const [cards, setCards] = useState(() => initialCards(block))
  const [imageStyle, setImageStyle] = useState(() => editableImageStyle(block))
  const [nextAuthorId, setNextAuthorId] = useState('')
  const [hydratedSignature, setHydratedSignature] = useState(() =>
    fieldsSignature(block)
  )
  const [settingsOpen, setSettingsOpen] = useState(
    () =>
      block.authorCards.length === 0 ||
      block.authorCards.some((card) => card.imageMediaSetId === null)
  )

  const authorsQuery = useQuery({
    queryKey: ['homepage-author-feature-authors'],
    queryFn: fetchAuthorsWithImages,
    enabled: canManage
  })

  useEffect(() => {
    const nextSignature = fieldsSignature(block)
    if (nextSignature === hydratedSignature) return
    setCards(initialCards(block))
    setImageStyle(editableImageStyle(block))
    setHydratedSignature(nextSignature)
  }, [block, hydratedSignature])

  useEffect(() => {
    if (cards.length <= 1 && imageStyle === 'mixed') {
      setImageStyle('portrait')
    }
  }, [cards.length, imageStyle])

  const authors = useMemo(() => authorsQuery.data ?? [], [authorsQuery.data])
  const authorsById = useMemo(
    () => new Map(authors.map((author) => [author.id, author])),
    [authors]
  )
  const selectedAuthorIds = new Set(cards.map((card) => card.author))
  const availableAuthors = authors.filter(
    (author) => !selectedAuthorIds.has(author.id)
  )
  const missingSelectedImages = cards.some((card) => card.image === null)
  const isSingleAuthor = cards.length <= 1
  const currentFields = () => fieldsFromDraft(cards, imageStyle)

  const saveMutation = useMutation({
    mutationFn: () => saveFields(currentFields()),
    onSuccess: () => setSettingsOpen(false)
  })

  function updateCard(index: number, patch: Partial<DraftCard>) {
    setCards((current) =>
      current.map((card, currentIndex) =>
        currentIndex === index ? { ...card, ...patch } : card
      )
    )
  }

  function addAuthor() {
    const id = Number(nextAuthorId)
    const author = authorsById.get(id)
    if (!author || cards.length >= 4) return
    setCards((current) => [
      ...current,
      {
        author: id,
        image: null,
        spotlightNote: '',
        isEmphasized: current.length === 0
      }
    ])
    setNextAuthorId('')
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
          Choose each Author’s exact profile image, then set focal placement for
          portrait, square, and wide crops.
        </p>

        <div className="hf-author-feature-mode">
          <strong>
            {isSingleAuthor ? 'Single Author' : 'Multiple Authors'}
          </strong>
          <span>
            {isSingleAuthor
              ? 'Choose one of three single-Author treatments.'
              : 'Multiple-Author layouts are a separate design pass.'}
          </span>
        </div>

        {isSingleAuthor ? (
          <div className="hf-editorial-feature-field-grid">
            <label className="is-wide">
              <span>Single Author treatment</span>
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
        ) : (
          <p className="hf-banner warning">
            Multiple-Author layout controls will be designed separately. This
            panel only manages Authors and their images for now.
          </p>
        )}

        <div className="hf-author-feature-card-list">
          {cards.map((card, index) => {
            const author = authorsById.get(card.author)
            const savedAuthor = block.authorCards.find(
              (candidate) => candidate.author.id === card.author
            )
            const authorImages = author?.authorImages ?? []
            const selectedImage = authorImages.find(
              (entry) => mediaSetId(entry) === card.image
            )
            const displayName =
              author?.displayName ??
              savedAuthor?.author.name ??
              `Author #${card.author}`

            return (
              <section
                className="hf-author-feature-card-editor"
                key={card.author}
                aria-label={displayName}
              >
                <header className="hf-author-feature-card-header">
                  <div>
                    <small>
                      {card.isEmphasized
                        ? 'Featured Author'
                        : `Supporting Author ${index + 1}`}
                    </small>
                    <strong>{displayName}</strong>
                  </div>
                  {cards.length > 1 ? (
                    <label className="hf-author-feature-emphasis">
                      <input
                        type="radio"
                        name={`author-feature-emphasis-${block.id}`}
                        checked={card.isEmphasized}
                        disabled={!canManage}
                        onChange={() =>
                          setCards((current) =>
                            current.map((candidate, currentIndex) => ({
                              ...candidate,
                              isEmphasized: currentIndex === index
                            }))
                          )
                        }
                      />
                      Main portrait
                    </label>
                  ) : null}
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
                        const selected = id === card.image
                        return (
                          <button
                            type="button"
                            key={id}
                            className={`hf-author-feature-image-option${selected ? ' is-selected' : ''}`}
                            aria-label={`Use ${title}`}
                            aria-pressed={selected}
                            disabled={!canManage}
                            onClick={() => updateCard(index, { image: id })}
                          >
                            {preview ? <img src={preview} alt="" /> : null}
                            <span>{title}</span>
                            <small>{selected ? 'Selected' : 'Choose'}</small>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="hf-banner error">
                      This Author has no uploaded Author Feature images. Add one
                      on their profile first.
                    </p>
                  )}
                </fieldset>

                {authorImages.length > 0 && card.image === null ? (
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
                  <span>Homepage note · {card.spotlightNote.length}/160</span>
                  <textarea
                    value={card.spotlightNote}
                    maxLength={160}
                    disabled={!canManage}
                    placeholder="e.g. Local expat"
                    onChange={(event) =>
                      updateCard(index, { spotlightNote: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="hf-btn-text hf-author-feature-remove"
                  disabled={!canManage}
                  onClick={() =>
                    setCards((current) => {
                      const next = current.filter(
                        (_, currentIndex) => currentIndex !== index
                      )
                      if (
                        next.length &&
                        !next.some((item) => item.isEmphasized)
                      ) {
                        next[0] = { ...next[0], isEmphasized: true }
                      }
                      return next
                    })
                  }
                >
                  Remove Author
                </button>
              </section>
            )
          })}
        </div>

        {cards.length < 4 ? (
          <div className="hf-author-feature-add-row">
            <label>
              <span>
                {cards.length ? 'Add supporting Author' : 'Add Author'}
              </span>
              <select
                value={nextAuthorId}
                disabled={!canManage || authorsQuery.isLoading}
                onChange={(event) => setNextAuthorId(event.target.value)}
              >
                <option value="">Choose Author</option>
                {availableAuthors.map((author) => {
                  const imageCount = author.authorImages?.length ?? 0
                  return (
                    <option
                      key={author.id}
                      value={author.id}
                      disabled={imageCount === 0}
                    >
                      {author.displayName}
                      {imageCount === 0 ? ' · no feature images' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <button
              type="button"
              className="hf-btn-secondary"
              disabled={!canManage || !nextAuthorId}
              onClick={addAuthor}
            >
              Add Author
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="hf-btn-primary"
          disabled={
            !canManage ||
            saveMutation.isPending ||
            cards.length === 0 ||
            missingSelectedImages
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
