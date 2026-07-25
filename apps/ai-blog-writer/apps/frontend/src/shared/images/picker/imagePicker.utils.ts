import { buildImageFileNamePrefix } from '../external/external-import.utils'

function sanitizeRef(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'image-picker'
  )
}

/** Timestamped so each upload/import run gets a distinct external ref. */
export function buildUploadIdentity(base: string, title: string) {
  const externalRef = `${sanitizeRef(base)}_${Date.now()}`
  return { externalRef, fileNamePrefix: buildImageFileNamePrefix(title, externalRef) }
}
