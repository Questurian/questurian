import type { ProcessImageOnlyResponse } from '../contracts/image-api.contracts'
import { processImageOnlyApi } from './process-image-only.api'

export type { ProcessImageOnlyResponse }

export async function processImageOnly(
  file: File,
  altText: string = ''
): Promise<ProcessImageOnlyResponse> {
  return processImageOnlyApi({ file, altText })
}
