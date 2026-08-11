import type { CollectionBeforeChangeHook } from 'payload'
import { staffUser } from '@/features/auth/lib/staff-user'

export const setUploadedBy: CollectionBeforeChangeHook = ({ req, operation, data }) => {
  const uploader = staffUser(req.user)

  if (operation === 'create' && uploader && data) {
    data.uploadedBy = uploader.id
    if (!data.user) {
      data.user = uploader.id
    }
  }

  return data
}
