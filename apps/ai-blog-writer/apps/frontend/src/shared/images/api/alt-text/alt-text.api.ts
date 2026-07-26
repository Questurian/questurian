import { generateAltTextApi } from './generate-alt-text.api'

export async function generateAltText(
  file: File,
  narrativeFocus?: string
): Promise<string> {
  return generateAltTextApi({ file, narrativeFocus })
}
