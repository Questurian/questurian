import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { syncCurrencyUsdRates } from '../features/shared/currencies/syncExchangeRates'

const run = async () => {
  const payload = await getPayload({ config: await config })

  try {
    console.log('Syncing USD exchange rates from ExchangeRate-API open...\n')
    const result = await syncCurrencyUsdRates(payload)
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  } catch (error) {
    console.error('Exchange rate sync failed:', error)
    process.exit(1)
  }
}

run()
