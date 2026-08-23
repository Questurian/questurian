import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { ImagePicker, type ImagePickerResult } from '../../shared/images/picker'
import { updateMediaSet } from '../../shared/api/payload/payload.api'
import { generateAltTextFromUrl } from '../mediaLibrary'
import { fetchLocationHomepagesList } from './locationHomepages'
import type { EditorialFeatureBlockResponse } from './pageBlocks'
import type { EditorialFeatureFieldsUpdate } from './mainHomepage/blocks/blockSettings.api'
import { getLocationHomepageLabel } from './locationHomepageList.utils'

type Props = {
  block: EditorialFeatureBlockResponse
  canManage: boolean
  saveFields: (fields: EditorialFeatureFieldsUpdate) => Promise<void>
}

const needsFeaturePanelSetup = (block: EditorialFeatureBlockResponse) =>
  !(
    block.featureKicker?.trim() ||
    block.featureTitle?.trim() ||
    block.featureDescription?.trim() ||
    block.featureMediaSetId ||
    block.linkedLocationId
  )

export default function EditorialFeaturePanelEditor({
  block,
  canManage,
  saveFields
}: Props) {
  const [featureKicker, setFeatureKicker] = useState(block.featureKicker ?? '')
  const [featureTitle, setFeatureTitle] = useState(block.featureTitle ?? '')
  const [featureDescription, setFeatureDescription] = useState(
    block.featureDescription ?? ''
  )
  const [linkedLocation, setLinkedLocation] = useState(
    block.linkedLocationId ?? 0
  )
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [generatedAlt, setGeneratedAlt] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(() =>
    needsFeaturePanelSetup(block)
  )

  useEffect(() => {
    setFeatureKicker(block.featureKicker ?? '')
  }, [block.featureKicker])

  useEffect(() => {
    setFeatureTitle(block.featureTitle ?? '')
  }, [block.featureTitle])

  useEffect(() => {
    setFeatureDescription(block.featureDescription ?? '')
  }, [block.featureDescription])

  useEffect(() => {
    setLinkedLocation(block.linkedLocationId ?? 0)
  }, [block.linkedLocationId])

  const locationsQuery = useQuery({
    queryKey: ['editorial-feature-linkable-locations'],
    queryFn: fetchLocationHomepagesList
  })
  const locationOptions = useMemo(
    () =>
      (locationsQuery.data ?? []).filter(
        (homepage) =>
          (homepage.isEnabled &&
            (homepage.publishedRevision ?? 0) > 0 &&
            (homepage.publishedBlockCount ?? 0) > 0) ||
          homepage.location?.id === block.linkedLocationId
      ),
    [block.linkedLocationId, locationsQuery.data]
  )

  const saveMutation = useMutation({
    mutationFn: saveFields,
    onSuccess: () => setSettingsOpen(false)
  })
  const generateAltMutation = useMutation({
    mutationFn: async () => {
      const url = block.featureImageWide?.url ?? block.featureImagePortrait?.url
      if (!url) throw new Error('Selected MediaSet has no usable image URL.')
      return generateAltTextFromUrl(
        url,
        `${featureKicker} ${featureTitle}`.trim()
      )
    },
    onSuccess: setGeneratedAlt
  })
  const saveAltMutation = useMutation({
    mutationFn: async () => {
      if (!block.featureMediaSetId || !generatedAlt.trim()) return
      await updateMediaSet(block.featureMediaSetId, {
        alt_text: generatedAlt.trim()
      })
      await saveFields({ featureMediaSet: block.featureMediaSetId })
      setGeneratedAlt('')
    }
  })

  const handleImageSelect = async (result: ImagePickerResult) => {
    if (result.kind !== 'mediaSets') return
    const id = Number(result.mediaSets[0]?.id)
    if (!Number.isInteger(id)) return
    setImagePickerOpen(false)
    await saveFields({ featureMediaSet: id })
  }

  return (
    <details
      className="hf-editorial-feature-disclosure"
      open={settingsOpen}
      onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
    >
      <summary>Feature panel settings</summary>
      <div className="hf-editorial-feature-fields">
        <div className="hf-editorial-feature-field-grid">
          <label>
            <span>Feature kicker · {featureKicker.length}/40</span>
            <input
              value={featureKicker}
              maxLength={40}
              disabled={!canManage}
              onChange={(event) => setFeatureKicker(event.target.value)}
            />
          </label>
          <label>
            <span>Feature title · {featureTitle.length}/100</span>
            <input
              value={featureTitle}
              maxLength={100}
              disabled={!canManage}
              onChange={(event) => setFeatureTitle(event.target.value)}
            />
          </label>
          <label className="is-wide">
            <span>Description · {featureDescription.length}/600</span>
            <textarea
              value={featureDescription}
              maxLength={600}
              disabled={!canManage}
              onChange={(event) =>
                setFeatureDescription(
                  event.target.value.replace(/[\r\n]+/g, ' ')
                )
              }
            />
          </label>
          <label>
            <span>Optional Location link</span>
            <select
              value={linkedLocation}
              disabled={!canManage}
              onChange={(event) =>
                setLinkedLocation(Number(event.target.value))
              }
            >
              <option value={0}>No link</option>
              {locationOptions.map((homepage) => (
                <option key={homepage.id} value={homepage.location?.id ?? 0}>
                  {getLocationHomepageLabel(homepage)}
                </option>
              ))}
            </select>
          </label>
          <div className="hf-editorial-feature-image-actions">
            <span>Feature MediaSet</span>
            <button
              type="button"
              className="hf-btn-secondary"
              disabled={!canManage}
              onClick={() => setImagePickerOpen(true)}
            >
              {block.featureMediaSetId ? 'Change image' : 'Choose image'}
            </button>
            {block.featureMediaSetId ? (
              <button
                type="button"
                className="hf-btn-text"
                disabled={!canManage}
                onClick={() => saveFields({ featureMediaSet: null })}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>

        {block.linkWarning ? (
          <div className="hf-banner warning">{block.linkWarning}</div>
        ) : null}
        {block.featureMediaSetId && !block.featureImageAltReady ? (
          <div className="hf-editorial-feature-alt">
            {generatedAlt ? (
              <>
                <textarea
                  value={generatedAlt}
                  onChange={(event) => setGeneratedAlt(event.target.value)}
                />
                <button
                  type="button"
                  className="hf-btn-secondary"
                  disabled={saveAltMutation.isPending}
                  onClick={() => saveAltMutation.mutate()}
                >
                  Review complete — save alt text
                </button>
              </>
            ) : (
              <button
                type="button"
                className="hf-btn-secondary"
                disabled={generateAltMutation.isPending}
                onClick={() => generateAltMutation.mutate()}
              >
                {generateAltMutation.isPending
                  ? 'Generating…'
                  : 'Generate missing alt text'}
              </button>
            )}
          </div>
        ) : null}

        <button
          type="button"
          className="hf-btn-primary"
          disabled={!canManage || saveMutation.isPending}
          onClick={() =>
            saveMutation.mutate({
              featureKicker: featureKicker.trim() || null,
              featureTitle: featureTitle.trim() || null,
              featureDescription: featureDescription.trim() || null,
              linkedLocation: linkedLocation || null
            })
          }
        >
          {saveMutation.isPending ? 'Saving feature…' : 'Save feature panel'}
        </button>
        {saveMutation.error instanceof Error ? (
          <p className="hf-modal-error">{saveMutation.error.message}</p>
        ) : null}
      </div>

      <ImagePicker
        isOpen={imagePickerOpen}
        locationRef={null}
        query={{
          browseUnit: 'mediaSets',
          requirementLabel: 'Requires portrait (4:5) and wide (16:9) crops'
        }}
        selection={{ mode: 'single' }}
        selectedId={block.featureMediaSetId}
        payloadOnly
        onSelect={(result) => void handleImageSelect(result)}
        onClose={() => setImagePickerOpen(false)}
      />
    </details>
  )
}
