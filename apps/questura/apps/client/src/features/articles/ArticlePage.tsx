import { ArticlePageHeader } from '@/features/articles/components/ArticlePageHeader'
import { Article, ContentBlock, FaqBlock, ImageBlock, ImgPairBlock, TextBlock } from './types'

function TextBlockRenderer({ block }: { block: TextBlock }) {
  return (
    <div
      className="article-prose"
      dangerouslySetInnerHTML={{ __html: block.content }}
    />
  )
}

function ImageBlockRenderer({ block }: { block: ImageBlock }) {
  return (
    <figure className="-mx-4">
      <img
        src={block.image.url}
        alt={block.altText ?? block.image.alt_text ?? ''}
        className="w-full object-cover"
      />
      {block.caption && (
        <figcaption className="px-4 pt-2 text-[11px] text-foreground/50 italic">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function ImgPairBlockRenderer({ block }: { block: ImgPairBlock }) {
  const alt1 = block.imageOne.mediaSet?.alt_text ?? block.imageOne.alt_text ?? ''
  const alt2 = block.imageTwo.mediaSet?.alt_text ?? block.imageTwo.alt_text ?? ''

  return (
    <figure className="-mx-4">
      <div className="flex gap-[2px]">
        <img src={block.imageOne.url} alt={alt1} className="w-1/2 aspect-[3/4] object-cover" />
        <img src={block.imageTwo.url} alt={alt2} className="w-1/2 aspect-[3/4] object-cover" />
      </div>
      {block.caption && (
        <figcaption className="px-4 pt-2 text-[11px] text-foreground/50 italic">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}

function FaqBlockRenderer({ block }: { block: FaqBlock }) {
  return (
    <div className="space-y-4">
      {block.title && (
        <h3 className="font-display text-[18px] font-semibold text-foreground">
          {block.title}
        </h3>
      )}
      {block.items.map((item) => (
        <div key={item.id} className="border-t border-foreground/10 pt-4">
          <p className="text-[14px] font-semibold text-foreground mb-1">{item.question}</p>
          <p className="text-[13px] text-foreground/70 leading-relaxed">{item.answer}</p>
        </div>
      ))}
    </div>
  )
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.blockType) {
    case 'text':
      return <TextBlockRenderer block={block} />
    case 'image':
      return <ImageBlockRenderer block={block} />
    case 'img-pair':
      return <ImgPairBlockRenderer block={block} />
    case 'faq':
      return <FaqBlockRenderer block={block} />
    default:
      return null
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export function ArticlePage({ article }: { article: Article }) {
  const { title, publishedAt, headerSection, contentBlocks, seoSection } = article
  const featuredImage = headerSection?.featuredImage
  const description = seoSection?.metaDescription

  return (
    <article className="min-h-screen bg-background">

      <ArticlePageHeader
        title={title}
      />

      {/* ── Featured image ───────────────────────────────────────── */}
      {featuredImage?.url && (
        <div className="px-0 sm:px-4">
          <div className="aspect-[4/3] w-full overflow-hidden">
            <img
              src={featuredImage.url}
              alt={featuredImage.alt_text ?? ''}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* ── Content blocks ───────────────────────────────────────── */}
      <div className="px-4 pt-8 pb-20">
        <div className="space-y-8">
          {contentBlocks?.map((block) => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>
      </div>

    </article>
  )
}
