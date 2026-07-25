import type { CollectionBeforeChangeHook } from 'payload'

export const capturePlaceDetailTypes: CollectionBeforeChangeHook = ({
  data,
  req,
  operation,
  context,
}) => {
  if (operation === 'create' && req.user) {
    data.createdBy = req.user.id
  }

  context.detailTypes = {
    diningType: data.diningType,
    accommodationType: data.accommodationType,
    nightlifeType: data.nightlifeType,
    attractionType: data.attractionType,
  }

  return data
}
