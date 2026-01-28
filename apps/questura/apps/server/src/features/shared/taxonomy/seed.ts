import { Payload } from 'payload'

export const seedCategories = async (payload: Payload) => {
  const categories = [
    'News',
    'Crime',
    'Guides',
    'Frugal Travel',
    'Luxury Travel',
    'Gastronomy',
    'Dating',
    'Advice',
    'Culture',
  ]

  console.log('Seeding article categories...')

  for (const name of categories) {
    const existing = await payload.find({
      collection: 'article-categories',
      where: { name: { equals: name } },
      limit: 1,
    })

    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'article-categories',
        data: {
          name,
          status: 'active',
          usageCount: 0,
        },
      })
      console.log(`  ✓ Created category: ${name}`)
    } else {
      console.log(`  - Category already exists: ${name}`)
    }
  }
}

export const seedTags = async (payload: Payload) => {
  const tags = [
    'solo-travel',
    'family-friendly',
    'lgbtq-friendly',
    'expat-life',
    'digital-nomad',
    'visa-requirements',
    'transportation',
    'safety-tips',
    'language-tips',
    'sim-cards',
    'nightlife',
    'hiking',
    'beaches',
    'museums',
    'street-art',
    'markets',
    'festivals',
    'summer',
    'winter',
    'high-season',
    'rainy-season',
  ]

  console.log('Seeding article tags...')

  for (const name of tags) {
    const existing = await payload.find({
      collection: 'article-tags',
      where: { name: { equals: name } },
      limit: 1,
    })

    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'article-tags',
        data: {
          name,
          status: 'active',
          usageCount: 0,
        },
      })
      console.log(`  ✓ Created tag: ${name}`)
    } else {
      console.log(`  - Tag already exists: ${name}`)
    }
  }
}

export const seedImageTags = async (payload: Payload) => {
  const imageTags = [
    'sunset',
    'sunrise',
    'beach',
    'ocean',
    'food',
    'drink',
    'people',
    'architecture',
    'street-scene',
    'nightlife',
    'interior',
    'landscape',
    'portrait',
    'nature',
    'cityscape',
    'monument',
    'restaurant',
    'hotel',
    'aerial',
    'detail',
  ]

  console.log('Seeding image-specific tags...')

  for (const name of imageTags) {
    const existing = await payload.find({
      collection: 'article-tags',
      where: { name: { equals: name } },
      limit: 1,
    })

    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'article-tags',
        data: {
          name,
          status: 'active',
          usageCount: 0,
        },
      })
      console.log(`  ✓ Created image tag: ${name}`)
    } else {
      console.log(`  - Tag already exists: ${name}`)
    }
  }
}

export const seedTaxonomy = async (payload: Payload) => {
  await seedCategories(payload)
  await seedTags(payload)
  await seedImageTags(payload)
  console.log('\n✓ Taxonomy seeding complete!')
}
