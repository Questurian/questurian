export type FluxModelId =
  | 'flux-2-max'
  | 'flux-2-pro-preview'
  | 'flux-2-pro'
  | 'flux-2-flex'

export type FluxModelOption = {
  id: FluxModelId
  label: string
  description: string
}

export const FLUX_MODEL_OPTIONS: FluxModelOption[] = [
  {
    id: 'flux-2-max',
    label: 'FLUX.2 Max',
    description:
      'Highest-precision FLUX.2 editing endpoint. Best when multi-reference fidelity matters more than speed or cost.'
  },
  {
    id: 'flux-2-pro-preview',
    label: 'FLUX.2 Pro Preview',
    description:
      'Latest continuously updated FLUX.2 [pro] endpoint. Best default when you want BFL’s newest improvements first.'
  },
  {
    id: 'flux-2-pro',
    label: 'FLUX.2 Pro (Pinned)',
    description:
      'Fixed FLUX.2 [pro] snapshot for more reproducible runs when you need a stable model target.'
  },
  {
    id: 'flux-2-flex',
    label: 'FLUX.2 Flex',
    description:
      'Same multi-reference editing flow, but with the FLEX model family for finer-grained controls and future guidance/steps tuning.'
  }
]
