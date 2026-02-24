import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { createSeoMetadata, fetchSeoMetadataById, updateSeoMetadata } from '../../api'
import type { ListicleItineraryDraft, MediaAssetOption, SeoMetadataForm, SeoMetadataOption } from '../../types'
import { createEmptySeoForm, normalizeSeoPayload } from '../services/seo-metadata.service'

type UseSeoManagerParams = {
  token?: string
  draft: ListicleItineraryDraft | null
  setDraft: Dispatch<SetStateAction<ListicleItineraryDraft | null>>
  seoOptions: SeoMetadataOption[]
  setSeoOptions: Dispatch<SetStateAction<SeoMetadataOption[]>>
  onError: (message: string) => void
  mediaAssets: MediaAssetOption[]
}

type UseSeoManagerResult = {
  seoOptions: SeoMetadataOption[]
  seoModalOpen: boolean
  seoModalMode: 'create' | 'edit'
  seoForm: SeoMetadataForm
  setSeoForm: Dispatch<SetStateAction<SeoMetadataForm>>
  isSeoSaving: boolean
  mediaAssets: MediaAssetOption[]
  openCreateSeoModal: () => Promise<void>
  openEditSeoModal: () => Promise<void>
  handleSaveSeo: () => Promise<void>
  closeSeoModal: () => void
}

export function useSeoManager({
  token,
  draft,
  setDraft,
  seoOptions,
  setSeoOptions,
  onError,
  mediaAssets,
}: UseSeoManagerParams): UseSeoManagerResult {
  const [seoModalOpen, setSeoModalOpen] = useState(false)
  const [seoModalMode, setSeoModalMode] = useState<'create' | 'edit'>('create')
  const [seoForm, setSeoForm] = useState<SeoMetadataForm>(createEmptySeoForm())
  const [isSeoSaving, setIsSeoSaving] = useState(false)

  async function openCreateSeoModal() {
    setSeoModalMode('create')
    setSeoForm(createEmptySeoForm())
    setSeoModalOpen(true)
  }

  async function openEditSeoModal() {
    if (!token || !draft?.seoSection.seo) {
      onError('Select SEO metadata before editing')
      return
    }

    try {
      setSeoModalMode('edit')
      const loaded = await fetchSeoMetadataById(draft.seoSection.seo, token)
      setSeoForm({
        ...createEmptySeoForm(),
        ...loaded,
        id: loaded.id,
        ogImage: loaded.ogImage ?? null,
      })
      setSeoModalOpen(true)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load SEO metadata')
    }
  }

  async function handleSaveSeo() {
    if (!token) return

    try {
      setIsSeoSaving(true)
      const normalizedPayload = normalizeSeoPayload(seoForm)

      if (seoModalMode === 'create') {
        const created = await createSeoMetadata(normalizedPayload, token)
        setSeoOptions((prev) => [{ id: Number(created.id), metaTitle: created.metaTitle, status: created.status }, ...prev])
        setDraft((current) => {
          if (!current) return current
          return {
            ...current,
            seoSection: {
              seo: Number(created.id),
            },
          }
        })
      } else {
        if (!seoForm.id) throw new Error('SEO metadata id is required for update')
        const updated = await updateSeoMetadata(seoForm.id, normalizedPayload, token)
        setSeoOptions((prev) =>
          prev.map((item) =>
            item.id === Number(updated.id) ? { ...item, metaTitle: updated.metaTitle, status: updated.status } : item,
          ),
        )
      }

      setSeoModalOpen(false)
      onError('')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save SEO metadata')
    } finally {
      setIsSeoSaving(false)
    }
  }

  return {
    seoOptions,
    seoModalOpen,
    seoModalMode,
    seoForm,
    setSeoForm,
    isSeoSaving,
    mediaAssets,
    openCreateSeoModal,
    openEditSeoModal,
    handleSaveSeo,
    closeSeoModal: () => setSeoModalOpen(false),
  }
}
