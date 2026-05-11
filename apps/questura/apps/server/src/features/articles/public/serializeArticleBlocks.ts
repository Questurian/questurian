import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'

async function toLexicalHTML(data: unknown): Promise<string> {
  return convertLexicalToHTMLAsync({
    data: data as Parameters<typeof convertLexicalToHTMLAsync>[0]['data'],
    disableContainer: true,
  })
}

async function serializeBlurbArray(blocks: Array<Record<string, unknown>>) {
  await Promise.all(
    blocks.map(async (block) => {
      if (block.blurb) block.blurb = await toLexicalHTML(block.blurb)
    }),
  )
}

export async function serializeStandardArticleBlocks(article: Record<string, unknown>) {
  const blocks = article.contentBlocks as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(blocks)) return

  await Promise.all(
    blocks.map(async (block) => {
      if (block.blockType === 'text' && block.content) {
        block.content = await toLexicalHTML(block.content)
      }
    }),
  )
}

export async function serializeMapsListicleBlocks(article: Record<string, unknown>) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(items)) return
  await serializeBlurbArray(items)
}

export async function serializeItineraryBlocks(article: Record<string, unknown>) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (Array.isArray(items)) await serializeBlurbArray(items)

  const days = article.itineraryDays as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(days)) return

  await Promise.all(
    days.map(async (day) => {
      const dayItems = day.items as Array<Record<string, unknown>> | undefined
      const whereStaying = day.whereStaying as Array<Record<string, unknown>> | undefined
      await Promise.all([
        Array.isArray(dayItems) ? serializeBlurbArray(dayItems) : Promise.resolve(),
        Array.isArray(whereStaying) ? serializeBlurbArray(whereStaying) : Promise.resolve(),
      ])
    }),
  )
}

export type ArticleCollectionSlug =
  | 'articles'
  | 'single-type-listicles'
  | 'listicle-itineraries'

export async function serializeArticleByCollection(
  collection: ArticleCollectionSlug,
  article: Record<string, unknown>,
) {
  if (collection === 'articles') await serializeStandardArticleBlocks(article)
  if (collection === 'single-type-listicles') await serializeMapsListicleBlocks(article)
  if (collection === 'listicle-itineraries') await serializeItineraryBlocks(article)
}
