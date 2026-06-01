import { getPayload } from 'payload'

import config from '@/payload.config'

export type ResetAllHomepageContentResult = {
  locationHomepagesCleared: number
}

export async function resetAllHomepageContent(): Promise<ResetAllHomepageContentResult> {
  const payload = await getPayload({ config })
  const locationHomepages = await payload.find({
    collection: 'location-homepages',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  for (const homepage of locationHomepages.docs) {
    await payload.update({
      collection: 'location-homepages',
      id: homepage.id,
      data: {
        isEnabled: false,
        pageBlocks: [],
        draftPageBlocks: [],
        publishedPageBlocks: [],
        lastPublishedAt: null,
        lastPublishedBy: null,
        publishedRevision: 0,
      },
      depth: 0,
      overrideAccess: true,
    })
  }

  await payload.updateGlobal({
    slug: 'main-homepage',
    data: {
      draftPageBlocks: [],
      publishedPageBlocks: [],
      lastPublishedAt: null,
      lastPublishedBy: null,
      publishedRevision: 0,
    },
    depth: 0,
    overrideAccess: true,
  })

  return {
    locationHomepagesCleared: locationHomepages.docs.length,
  }
}
