import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { seedTaxonomy } from '../features/shared/taxonomy/seed'

const seed = async () => {
  const payload = await getPayload({ config: await config })

  try {
    console.log('Starting taxonomy seeding...\n')
    await seedTaxonomy(payload)
    process.exit(0)
  } catch (error) {
    console.error('Seeding failed:', error)
    process.exit(1)
  }
}

seed()
