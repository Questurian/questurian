import type { FluxEditImageResponse } from '../contracts/image-api.contracts'
import { fluxEditApi } from '../flux-edit.api'

export type { FluxEditImageResponse }

export type FluxEditOptions = {
  additionalReferenceImages?: File[]
  modelId?: string
  width?: number
  height?: number
  safetyTolerance?: number
  promptUpsampling?: boolean
  seed?: string | number
}

export async function generateFluxEditedImage(
  prompt: string,
  referenceImage: File,
  token: string,
  options?: FluxEditOptions
): Promise<FluxEditImageResponse> {
  return fluxEditApi({
    prompt,
    referenceImage,
    token,
    ...options
  })
}
