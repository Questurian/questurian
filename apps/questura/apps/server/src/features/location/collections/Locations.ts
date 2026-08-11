/**
 * Locations Collection
 *
 * Managed by admins via the API or admin UI.
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { serviceAccountHasCollectionGrant } from '@/features/auth/lib/service-account-grants'
import type { CollectionConfig } from 'payload'
import { beforeValidateLocation } from '../hooks/beforeValidateLocation'
import { ensureParentLocation } from '../hooks/ensureParentLocation'
import { preventReferencedLocationDelete } from '../hooks/preventReferencedLocationDelete'
import {
  revalidateLocationAfterChange,
  revalidateLocationAfterDelete,
} from '@/features/public-revalidation/revalidate-client'
import { locationFields } from './fields'

export const Locations: CollectionConfig = {
  slug: 'locations',
  labels: {
    singular: 'Location',
    plural: 'Locations',
  },
  admin: {
    useAsTitle: 'locationKey',
    defaultColumns: ['level', 'countryName', 'cityName', 'neighborhoodName'],
    group: 'Tags',
    description: 'Locations are managed by admins via the API or admin UI.',
  },

  access: {
    read: () => true,
    create: ({ req }) =>
      serviceAccountHasCollectionGrant(req.user, 'locations', 'create') ||
      staffUser(req.user)?.role === 'admin',
    update: ({ req }) => staffUser(req.user)?.role === 'admin',
    delete: ({ req }) => staffUser(req.user)?.role === 'admin',
  },

  fields: locationFields,
  hooks: {
    beforeValidate: [beforeValidateLocation],
    beforeChange: [ensureParentLocation],
    afterChange: [revalidateLocationAfterChange],
    afterDelete: [revalidateLocationAfterDelete],
    beforeDelete: [preventReferencedLocationDelete],
  },
}
