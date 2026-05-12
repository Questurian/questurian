import { Field } from 'payload'

export const category: Field = {
  name: 'category',
  type: 'relationship',
  relationTo: 'article-categories',
  required: false, // Optional for now to allow existing articles to migrate
  hasMany: false,
  admin: {
    position: 'sidebar',
    description:
      'Main category for this article (required for new published city-scope articles). Changing this on a published article will change its public URL — a permanent redirect from the old URL is created automatically.',
  },
}

export const tags: Field = {
  name: 'tags',
  type: 'relationship',
  relationTo: 'article-tags',
  hasMany: true,
  maxRows: 10,
  admin: {
    position: 'sidebar',
    description: 'Select up to 10 relevant tags for this article',
  },
}
