import type { Field } from 'payload'

export const profileFields: Field[] = [
  {
    name: 'publicProfile',
    type: 'group',
    admin: {
      description: 'Travel expert profile information visible to site visitors',
    },
    fields: [
      {
        name: 'avatar',
        type: 'upload',
        relationTo: 'media-assets',
        admin: {
          description: 'Profile picture displayed on expert profiles',
        },
      },
      {
        name: 'displayName',
        type: 'text',
        admin: {
          description: 'Name shown to website visitors (auto-generates from first/last name if empty)',
        },
        hooks: {
          beforeChange: [
            ({ value, data, req }) => {
              if (!value && data && req.data) {
                const firstName = req.data.firstName || data.firstName || ''
                const lastName = req.data.lastName || data.lastName || ''
                if (firstName && lastName) {
                  return `${firstName} ${lastName}`
                }
              }
              return value
            },
          ],
        },
      },
      {
        name: 'bio',
        type: 'textarea',
        admin: {
          description: 'Travel expert biography displayed on profile page',
        },
      },
      {
        name: 'expertise',
        type: 'array',
        admin: {
          description: 'Areas of travel expertise (e.g., "Southeast Asia", "Budget Travel")',
        },
        fields: [
          {
            name: 'area',
            type: 'text',
            required: true,
            admin: {
              description: 'Specific area of travel expertise',
            },
          },
        ],
      },
      {
        name: 'socialLinks',
        type: 'group',
        admin: {
          description: 'Social media links displayed on expert profile',
        },
        fields: [
          {
            name: 'instagram',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/.+/
              return urlPattern.test(val) || 'Please enter a valid Instagram URL'
            },
            admin: {
              description: 'Full Instagram profile URL',
            },
          },
          {
            name: 'twitter',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+/
              return urlPattern.test(val) || 'Please enter a valid Twitter/X URL'
            },
            admin: {
              description: 'Full Twitter/X profile URL',
            },
          },
          {
            name: 'facebook',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.)?(facebook\.com|fb\.com)\/.+/
              return urlPattern.test(val) || 'Please enter a valid Facebook URL'
            },
            admin: {
              description: 'Full Facebook profile or page URL',
            },
          },
          {
            name: 'linkedin',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.)?linkedin\.com\/.+/
              return urlPattern.test(val) || 'Please enter a valid LinkedIn URL'
            },
            admin: {
              description: 'Full LinkedIn profile URL',
            },
          },
          {
            name: 'reddit',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.|old\.)?reddit\.com\/.+/
              return urlPattern.test(val) || 'Please enter a valid Reddit URL'
            },
            admin: {
              description: 'Full Reddit profile URL',
            },
          },
          {
            name: 'youtube',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/
              return urlPattern.test(val) || 'Please enter a valid YouTube URL'
            },
            admin: {
              description: 'Full YouTube channel URL',
            },
          },
          {
            name: 'patreon',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/(www\.)?patreon\.com\/.+/
              return urlPattern.test(val) || 'Please enter a valid Patreon URL'
            },
            admin: {
              description: 'Full Patreon page URL',
            },
          },
          {
            name: 'website',
            type: 'text',
            validate: (val: string | null | undefined) => {
              if (!val) return true
              const urlPattern = /^https?:\/\/.+\..+/
              return urlPattern.test(val) || 'Please enter a valid website URL'
            },
            admin: {
              description: 'Personal website or blog URL',
            },
          },
        ],
      },
    ],
  },
]
