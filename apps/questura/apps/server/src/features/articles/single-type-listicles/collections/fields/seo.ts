import { Field } from 'payload'

const isValidAbsoluteUrl = (value: string | null | undefined): boolean => {
  if (!value) return true

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const urlValidationMessage = 'Enter a valid absolute URL (for example https://example.com/page).'

export const seo: Field = {
  type: 'tabs',
  admin: {
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
  tabs: [
    {
      label: 'SEO & Metadata',
      fields: [
        {
          type: 'group',
          name: 'seoSection',
          fields: [
            {
              name: 'seoTitle',
              label: 'SEO Title',
              type: 'text',
              maxLength: 60,
              admin: {
                description: 'Search result title (recommended under 60 characters).',
              },
            },
            {
              name: 'metaDescription',
              label: 'Meta Description',
              type: 'textarea',
              maxLength: 160,
              admin: {
                description: 'Search snippet summary (recommended around 150-160 characters).',
              },
            },
            {
              name: 'openGraph',
              label: 'Open Graph Tags',
              type: 'group',
              fields: [
                {
                  name: 'title',
                  label: 'og:title',
                  type: 'text',
                },
                {
                  name: 'description',
                  label: 'og:description',
                  type: 'textarea',
                },
                {
                  name: 'imageUrl',
                  label: 'og:image',
                  type: 'text',
                  validate: (value) => (isValidAbsoluteUrl(value) ? true : urlValidationMessage),
                },
                {
                  name: 'url',
                  label: 'og:url',
                  type: 'text',
                  validate: (value) => (isValidAbsoluteUrl(value) ? true : urlValidationMessage),
                },
              ],
            },
            {
              name: 'twitterCard',
              label: 'Twitter Card Tags',
              type: 'group',
              fields: [
                {
                  name: 'card',
                  label: 'twitter:card',
                  type: 'select',
                  defaultValue: 'summary',
                  options: [
                    { label: 'Summary', value: 'summary' },
                    { label: 'Summary Large Image', value: 'summary_large_image' },
                  ],
                },
                {
                  name: 'title',
                  label: 'twitter:title',
                  type: 'text',
                },
                {
                  name: 'description',
                  label: 'twitter:description',
                  type: 'textarea',
                },
                {
                  name: 'imageUrl',
                  label: 'twitter:image',
                  type: 'text',
                  validate: (value) => (isValidAbsoluteUrl(value) ? true : urlValidationMessage),
                },
              ],
            },
            {
              name: 'structuredData',
              label: 'Structured Data (JSON-LD)',
              type: 'json',
              admin: {
                description: 'Provide a valid JSON-LD object for schema.org structured data.',
              },
            },
            {
              name: 'robots',
              label: 'Robots Meta Tag',
              type: 'group',
              fields: [
                {
                  name: 'index',
                  type: 'select',
                  defaultValue: 'index',
                  options: [
                    { label: 'index', value: 'index' },
                    { label: 'noindex', value: 'noindex' },
                  ],
                },
                {
                  name: 'follow',
                  type: 'select',
                  defaultValue: 'follow',
                  options: [
                    { label: 'follow', value: 'follow' },
                    { label: 'nofollow', value: 'nofollow' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
