import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
} from 'payload'
import {
  assertCanDeleteHomepageFeaturedContent,
  assertCanUnpublishHomepageFeaturedContent,
} from '../../../shared/lib/referenceLocks'

export const preventSingleTypeListicleUnpublish: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
}) => {
  if (
    originalDoc?.status === 'published'
    && data?.status
    && data.status !== 'published'
    && originalDoc?.id
  ) {
    await assertCanUnpublishHomepageFeaturedContent(
      req.payload,
      'single-type-listicles',
      originalDoc.id,
    )
  }

  return data
}

export const applySingleTypeListicleMetadata: CollectionBeforeChangeHook = ({
  data,
  req,
  operation,
}) => {
  if (operation === 'create' && req.user?.id) {
    data.author = req.user.id
  }

  if (data?.status === 'published' && !data?.publishedAt) {
    data.publishedAt = new Date().toISOString()
  }

  data.articleType = 'single-type-listicle'

  return data
}

export const preventSingleTypeListicleDelete: CollectionBeforeDeleteHook = async ({
  req,
  id,
}) => {
  await assertCanDeleteHomepageFeaturedContent(req.payload, 'single-type-listicles', id)
}
