import 'dotenv/config'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { migrateArticleDoc } from './finish-media-set-migration/article-migration'
import { auditCardDoc } from './finish-media-set-migration/card-audit'
import { parseOptions, printHelp } from './finish-media-set-migration/cli'
import {
  ARTICLE_COLLECTIONS,
  CARD_COLLECTIONS,
  createCounters,
} from './finish-media-set-migration/config'
import { fetchAll } from './finish-media-set-migration/payload-queries'
import type { MigrationContext } from './finish-media-set-migration/types'

async function migrateArticles(context: MigrationContext) {
  for (const articleConfig of ARTICLE_COLLECTIONS) {
    const docs = await fetchAll(context.payload, articleConfig.collection, {
      depth: 2,
      limit: context.options.limit,
      maxDocs: context.options.maxDocs,
      select: {
        id: true,
        title: true,
        [articleConfig.headerField]: true,
        seoSection: true,
      },
    })

    for (const doc of docs) {
      try {
        await migrateArticleDoc(context, {
          collection: articleConfig.collection,
          headerField: articleConfig.headerField,
          doc,
        })
      } catch (error) {
        context.counters.errors += 1
        console.error(
          `[error] ${articleConfig.collection} ${doc.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }
}

async function auditCardCollections(context: MigrationContext) {
  for (const cardConfig of CARD_COLLECTIONS) {
    const docs = await fetchAll(context.payload, cardConfig.collection, {
      depth: 2,
      limit: context.options.limit,
      maxDocs: context.options.maxDocs,
      select: {
        id: true,
        title: true,
        [cardConfig.field]: true,
      },
    })

    for (const doc of docs) {
      try {
        await auditCardDoc(context, { config: cardConfig, doc })
      } catch (error) {
        context.counters.errors += 1
        console.error(
          `[error] ${cardConfig.collection} ${doc.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }
}

async function main() {
  const options = parseOptions()
  if (options.help) {
    printHelp()
    return
  }

  console.log(
    options.write ? '[write] media-set migration starting' : '[dry-run] media-set migration starting',
  )
  if (options.write) {
    console.log('Write mode enabled. Verify DB backup before running this command.')
  }

  const context: MigrationContext = {
    payload: await getPayload({ config }),
    options,
    counters: createCounters(),
  }

  await migrateArticles(context)
  await auditCardCollections(context)

  console.log('\nSummary')
  console.log(JSON.stringify(context.counters, null, 2))
  if (context.counters.errors > 0) process.exit(1)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
