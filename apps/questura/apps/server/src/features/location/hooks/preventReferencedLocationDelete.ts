import type { CollectionBeforeDeleteHook } from 'payload'
import { findLocationReferences } from '@/shared/location/server/references'

export const preventReferencedLocationDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const location = id
    ? await req.payload.findByID({
        collection: 'locations',
        id,
        depth: 0,
        overrideAccess: true,
        select: {
          id: true,
          locationKey: true,
        },
      })
    : null

  const locationKey = location?.locationKey
  if (!locationKey) return

  const children = await req.payload.find({
    collection: 'locations',
    where: {
      parentKey: {
        equals: locationKey,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (children.totalDocs > 0) {
    throw new Error(`Cannot delete location "${locationKey}" because it has child locations.`)
  }

  const references = await findLocationReferences(req.payload, locationKey, location?.id)

  if (references.length > 0) {
    throw new Error(
      `Cannot delete location "${locationKey}" because it is referenced by: ${references.join(
        ', ',
      )}`,
    )
  }
}
