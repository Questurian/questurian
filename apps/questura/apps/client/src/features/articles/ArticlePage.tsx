import { Share2, Bookmark } from 'lucide-react'
import { Article, ContentBlock, FaqBlock, ImageBlock, ImgPairBlock, TextBlock } from './types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}


function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ── Block renderers ──────────────────────────────────────────────────────────

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

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-4 pt-8 pb-5">

        <h1 className="font-display text-foreground text-[26px] leading-[1.22] mb-3">
          {title}
        </h1>

        {description && (
          <p className="font-[family-name:var(--font-dm-sans)] text-foreground text-[13px] leading-[1.55] mb-3">
            {description}
          </p>
        )}

        <p className="text-foreground/40 text-[12px] mb-5">
          Updated <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
        </p>

        <hr className="border-foreground/10 mb-1" />

        {/* Action bar: share / save + Google */}
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-5 shrink-0">
            <button type="button" className="text-foreground/50 active:text-foreground transition-colors">
              <Share2 size={18} strokeWidth={1.75} />
            </button>

            <button type="button" className="text-foreground/50 active:text-foreground transition-colors">
              <Bookmark size={18} strokeWidth={1.75} />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2.5 shrink-0 border border-foreground/20 rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-[12px] sm:text-[13px] font-medium text-foreground/80 bg-background active:bg-foreground/5 transition-colors"
          >
            <GoogleG />
            Add Us On Google
          </button>
        </div>

        <hr className="border-foreground/10 mb-4" />
      </div>

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
