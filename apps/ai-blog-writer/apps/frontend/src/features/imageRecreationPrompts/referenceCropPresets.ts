import {
  VARIANT_SEQUENCE,
  VARIANT_SPECS,
  type ImageVariantType,
  type VariantSpec,
} from '../images'

export type ReferenceCropPresetId = 'original' | ImageVariantType

export type ReferenceCropPresetOption = {
  id: ReferenceCropPresetId
  title: string
  summaryLabel: string
  width: number | null
  height: number | null
  ratio: number | null
  spec: VariantSpec | null
}

const VARIANT_TITLE_MAP: Record<ImageVariantType, string> = {
  thumbnail: 'Thumbnail',
  square: 'Square',
  wide: 'Wide',
  portrait: 'Portrait',
  hero: 'Hero',
  open_graph: 'Open Graph',
  editorial: 'Editorial',
}

export const REFERENCE_CROP_PRESET_OPTIONS: ReferenceCropPresetOption[] = [
  {
    id: 'original',
    title: 'Original',
    summaryLabel: 'Original reference',
    width: null,
    height: null,
    ratio: null,
    spec: null,
  },
  ...VARIANT_SEQUENCE.map((variantType) => {
    const spec = VARIANT_SPECS[variantType]
    const title = VARIANT_TITLE_MAP[variantType]

    return {
      id: variantType,
      title,
      summaryLabel: `${title} crop`,
      width: spec.width,
      height: spec.height,
      ratio: spec.ratio,
      spec,
    }
  }),
]

export const REFERENCE_CROP_PRESET_MAP: Record<
  ReferenceCropPresetId,
  ReferenceCropPresetOption
> = REFERENCE_CROP_PRESET_OPTIONS.reduce(
  (accumulator, option) => {
    accumulator[option.id] = option
    return accumulator
  },
  {} as Record<ReferenceCropPresetId, ReferenceCropPresetOption>,
)

export function getReferenceCropPreset(
  presetId: ReferenceCropPresetId,
): ReferenceCropPresetOption {
  return REFERENCE_CROP_PRESET_MAP[presetId]
}
