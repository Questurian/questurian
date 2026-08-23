import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { payloadRequest } from '../../shared/api/client/http'
import { mediaSetPreviewUrl } from '../staff/api/staff.api'
import AuthorImagePlacementEditor from '../staff/components/AuthorImagePlacementEditor'
import type { Author, AuthorImageEntry } from '../staff/types'
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

export default function AuthorFeaturePanelEditor({
  block,
  canManage,
  saveFields
}: Props) {
  const [cards, setCards] = useState<DraftCard[]>([])
  const [imageStyle, setImageStyle] = useState(block.imageStyle)
  const [motionStyle, setMotionStyle] = useState(block.motionStyle)
  const [nextAuthorId, setNextAuthorId] = useState('')

  const authorsQuery = useQuery({
    queryKey: ['homepage-author-feature-authors'],
    queryFn: fetchAuthorsWithImages,
    enabled: canManage
  })

  useEffect(() => {
    setCards(
      block.authorCards.map((card) => ({
        author: card.author.id,
        image: card.imageMediaSetId,
        spotlightNote: card.spotlightNote ?? '',
        isEmphasized: card.isEmphasized
      }))
    )
    setImageStyle(block.imageStyle)
    setMotionStyle(block.motionStyle)
  }, [block])

  const authors = authorsQuery.data ?? []
  const authorsById = useMemo(
    () => new Map(authors.map((author) => [author.id, author])),
    [authors]
  )
  const selectedAuthorIds = new Set(cards.map((card) => card.author))
  const availableAuthors = authors.filter(
    (author) => !selectedAuthorIds.has(author.id)
  )
  const missingSelectedImages = cards.some((card) => card.image === null)

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFields({
        imageStyle,
        motionStyle,
        authorCards: cards.map((card, index) => ({
          author: card.author,
          image: card.image,
          spotlightNote: card.spotlightNote.trim() || null,
          isEmphasized: cards.some((candidate) => candidate.isEmphasized)
            ? card.isEmphasized
            : index === 0
        }))
      })
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
    const firstImage = author.authorImages?.[0]
      ? mediaSetId(author.authorImages[0])
      : null
    setCards((current) => [
      ...current,
      {
        author: id,
        image: firstImage,
        spotlightNote: '',
        isEmphasized: current.length === 0
      }
    ])
    setNextAuthorId('')
  }

  return (
    <details className="hf-editorial-feature-disclosure" open>
      <summary>Author feature settings</summary>
      <div className="hf-editorial-feature-fields hf-author-feature-fields">
        <div className="hf-editorial-feature-field-grid">
          <label>
            <span>Image style</span>
            <select
              value={imageStyle}
              onChange={(event) =>
                setImageStyle(event.target.value as typeof imageStyle)
              }
            >
              <option value="mixed">Mixed</option>
              <option value="circle">Circle</option>
              <option value="square">Square</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label>
            <span>Motion</span>
            <select
              value={motionStyle}
              onChange={(event) =>
                setMotionStyle(event.target.value as typeof motionStyle)
              }
            >
              <option value="subtle">Subtle</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>

        <div className="hf-author-feature-card-list">
          {cards.map((card, index) => {
            const author = authorsById.get(card.author)
            const authorImages = author?.authorImages ?? []
            const selectedImage = authorImages.find(
              (entry) => mediaSetId(entry) === card.image
            )
            return (
              <div
                className="hf-author-feature-card-editor"
                key={`${card.author}:${index}`}
              >
                <label className="hf-author-feature-emphasis">
                  <input
                    type="radio"
                    name={`author-feature-emphasis-${block.id}`}
                    checked={card.isEmphasized}
                    onChange={() =>
                      setCards((current) =>
                        current.map((candidate, currentIndex) => ({
                          ...candidate,
                          isEmphasized: currentIndex === index
                        }))
                      )
                    }
                  />
                  Main
                </label>
                <strong>
                  {author?.displayName ?? `Author #${card.author}`}
                </strong>
                <label>
                  <span>Image</span>
                  <select
                    value={card.image ?? ''}
                    onChange={(event) =>
                      updateCard(index, {
                        image: event.target.value
                          ? Number(event.target.value)
                          : null
                      })
                    }
                  >
                    <option value="">Select image</option>
                    {authorImages.map((entry) => {
                      const id = mediaSetId(entry)
                      const mediaSet =
                        typeof entry.mediaSet === 'number'
                          ? null
                          : entry.mediaSet
                      return (
                        <option key={id} value={id}>
                          {mediaSet?.title || `MediaSet #${id}`}
                        </option>
                      )
                    })}
                  </select>
                </label>
                <div className="hf-author-feature-image-picker">
                  {authorImages.map((entry) => {
                    const id = mediaSetId(entry)
                    const preview = mediaSetPreviewUrl(entry.mediaSet)
                    const selected = id === card.image
                    return (
                      <button
                        type="button"
                        key={id}
                        className={`hf-author-feature-image-option${selected ? ' is-selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => updateCard(index, { image: id })}
                      >
                        {preview ? <img src={preview} alt="" /> : null}
                        <span>{mediaSetTitle(entry)}</span>
                      </button>
                    )
                  })}
                </div>
                {authorImages.length === 0 ? (
                  <p className="hf-banner error">
                    This Author has no uploaded Author Feature images.
                  </p>
                ) : card.image === null ? (
                  <p className="hf-banner error">
                    Select one of this Author’s uploaded images.
                  </p>
                ) : null}
                {selectedImage ? (
                  <AuthorImagePlacementEditor
                    mediaSet={selectedImage.mediaSet}
                    disabled={!canManage}
                  />
                ) : null}
                <label>
                  <span>Spotlight note</span>
                  <textarea
                    value={card.spotlightNote}
                    maxLength={160}
                    onChange={(event) =>
                      updateCard(index, { spotlightNote: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="hf-btn-ghost"
                  onClick={() =>
                    setCards((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index
                      )
                    )
                  }
                >
                  Remove author
                </button>
              </div>
            )
          })}
        </div>

        <div className="hf-editorial-feature-field-grid">
          <label>
            <span>Add Author</span>
            <select
              value={nextAuthorId}
              onChange={(event) => setNextAuthorId(event.target.value)}
            >
              <option value="">Choose author</option>
              {availableAuthors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="hf-btn-secondary"
            disabled={!nextAuthorId || cards.length >= 4}
            onClick={addAuthor}
          >
            Add author
          </button>
        </div>

        <button
          type="button"
          className="hf-btn-primary"
          disabled={
            saveMutation.isPending ||
            cards.length === 0 ||
            missingSelectedImages
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save author feature'}
        </button>
        {saveMutation.error ? (
          <p className="hf-banner error">{saveMutation.error.message}</p>
        ) : null}
      </div>
    </details>
  )
}
