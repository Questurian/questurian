import 'dotenv/config'
import { resetAllHomepageContent } from '../features/homepage-featured-content/reset-all-content/service'

async function clearHomepageBlocks() {
  console.log('Clearing all homepage content...\n')
  const result = await resetAllHomepageContent()
  console.log(`Done. ${result.locationHomepagesCleared} location homepage(s) and the main homepage cleared.`)
  process.exit(0)
}

clearHomepageBlocks().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
