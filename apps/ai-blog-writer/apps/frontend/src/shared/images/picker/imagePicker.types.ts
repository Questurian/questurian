import type { ReactNode } from 'react'
import type { MediaAsset, MediaSet } from '../../api/payload/payload.types'
import type { UploadImageResponse } from '../api/imagesApi'

/** What the Payload grid browses. */
export type ImagePickerBrowseUnit = 'assets' | 'mediaSets'

/**
 * The reactive filter that drives the engine's Payload fetch. Callers pass this
 * as a normal prop; changing it resets and refetches (e.g. the trio square/wide
 * toggle swaps `variant`). "Uncontrolled" means the engine owns the fetch state
 * machine — not the filter criteria. See ADR 0020.
 */
export type ImagePickerQuery = {
  browseUnit: ImagePickerBrowseUnit
  /** Server-side variant filter (assets only). */
  variant?: MediaAsset['variant']
  /** Exact pixel dimensions filter (assets only). */
  exactDimensions?: { width: number; height: number }
  /** Minimum pixel dimensions filter (assets only). */
  minDimensions?: { width: number; height: number }
  /** Show only assets that belong to a MediaSet (variant-workflow images). Client-side; Payload has no such filter. */
  requireMediaSet?: boolean
  /** Human-readable requirement rendered in the context bar. */
  requirementLabel?: string
}

export type ImagePickerSelectionMode =
  | { mode: 'single' }
  | { mode: 'multiple'; count: number }

/**
 * What the engine emits on selection. The caller maps it to whatever id it
 * persists — asset id, set id, or resolveMediaSetPreviewAssetId(set). The engine
 * stays out of the persistence decision (ADR 0020).
 *
 * - `assets`   — Payload grid select in 'assets' mode (single = length 1; multi = length N), resolved entities.
 * - `mediaSets`— Payload grid select in 'mediaSets' mode.
 * - `upload`   — a fresh upload OR a single-mode external import; raw response carries variantAssetIds + mediaSetId.
 *
 * In exact-N multi mode, external imports are pushed into the selection buffer
 * (not emitted as `upload`); confirm emits a single `assets` result.
 */
export type ImagePickerResult =
  | { kind: 'assets'; assets: MediaAsset[] }
  | { kind: 'mediaSets'; mediaSets: MediaSet[] }
  | { kind: 'upload'; response: UploadImageResponse }

export type ImagePickerProps = {
  isOpen: boolean
  token?: string
  /** Required for uploads/imports; when null those tabs show a notice. */
  locationRef: number | null
  /** Reactive filter that drives the Payload fetch. */
  query: ImagePickerQuery
  /** Single (default) or exact-N multi-select. */
  selection?: ImagePickerSelectionMode
  /** Currently persisted id, kept highlighted/hydrated in single mode. */
  selectedId?: number | null
  uploadExternalRefBase?: string
  uploadFileNameTitle?: string
  importExternalRefBase?: string
  importFileNameTitle?: string
  importAltContextLabel?: string
  /** Caller-owned controls rendered above the Payload grid. */
  aboveGrid?: ReactNode
  /** Restrict the picker to existing Payload records. */
  payloadOnly?: boolean
  /** Confirm-button label in exact-N multi mode. */
  confirmLabel?: string
  onSelect: (result: ImagePickerResult) => void
  onClose: () => void
}

export type ImagePickerTab = 'payload' | 'upload' | 'unsplash' | 'pexels'
