import type { CollectionBeforeChangeHook } from 'payload'

export const setUploadedBy: CollectionBeforeChangeHook = ({ req, operation, data }) => {
  if (operation === 'create' && req.user && data) {
    data.uploadedBy = req.user.id
    if (!data.user) {
      data.user = req.user.id
    }
  }

  return data
}
