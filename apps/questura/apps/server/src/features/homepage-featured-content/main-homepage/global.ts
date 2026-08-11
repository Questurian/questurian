import { staffUser } from '@/features/auth/lib/staff-user'
import type { GlobalConfig } from 'payload'

export const MainHomepage: GlobalConfig = {
  slug: 'main-homepage',
  label: 'Main Homepage',
  admin: {
    group: 'Content',
    description: 'Singleton curated homepage for the main domain homepage.',
  },
  access: {
    read: () => true,
    update: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
    },
  },
  fields: [
    {
      name: 'draftPageBlocks',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Private working copy for editors. Managed by the ABW homepage tool.',
      },
    },
    {
      name: 'publishedPageBlocks',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Public-ready snapshot for the main homepage.',
        readOnly: true,
      },
    },
    {
      name: 'lastPublishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'lastPublishedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'publishedRevision',
      type: 'number',
      defaultValue: 0,
      min: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
