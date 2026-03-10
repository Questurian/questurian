import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { seedCurrencies } from '../features/shared/currencies/seed'

const seed = async () => {
  const payload = await getPayload({ config: await config })

  try {
    console.log('Starting currency seeding...\n')
    await seedCurrencies(payload)
    process.exit(0)
  } catch (error) {
    console.error('Currency seeding failed:', error)
    process.exit(1)
  }
}

seed()
