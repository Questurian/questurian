'use client'

import { useState, type ReactNode } from 'react'
import { Link2, Printer } from 'lucide-react'

type ArticleShareBarProps = {
  url: string
  title: string
  imageUrl?: string | null
}

function ShareCircle({
  label,
  onClick,
  href,
  children,
}: {
  label: string
  onClick?: () => void
  href?: string
  children: ReactNode
}) {
  const className =
    'inline-flex size-8 items-center justify-center rounded-full border border-foreground/80 text-foreground transition-colors hover:bg-foreground hover:text-background'

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={className}
      >
        {children}
      </a>
    )
  }

  return (
    <button type="button" aria-label={label} className={className} onClick={onClick}>
      {children}
    </button>
  )
}

export function ArticleShareBar({ url, title, imageUrl }: ArticleShareBarProps) {
  const [copied, setCopied] = useState(false)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)
  const encodedImage = imageUrl ? encodeURIComponent(imageUrl) : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-2.5" data-article-share>
      <ShareCircle label={copied ? 'Link copied' : 'Copy link'} onClick={copyLink}>
        <Link2 size={13} strokeWidth={2} aria-hidden />
      </ShareCircle>
      <ShareCircle
        label="Share on Facebook"
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
      >
        <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
          <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v3H6v4h3v8h4v-8h3.2l.8-4H13V9c0-.6.4-1 1-1Z" />
        </svg>
      </ShareCircle>
      <ShareCircle
        label="Share on Pinterest"
        href={`https://www.pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}${encodedImage ? `&media=${encodedImage}` : ''}`}
      >
        <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
          <path d="M12 2C6.5 2 2 6.3 2 11.6c0 4 2.5 7.4 6.1 8.6-.1-.7-.2-1.8 0-2.6.2-.7 1.4-6 1.4-6s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.1 0 3.6-2.7 3.6-5.9 0-2.4-1.6-4.2-4.6-4.2-3.3 0-5.4 2.5-5.4 5.2 0 1 .5 2.1 1 2.7.1.1.1.2.1.3l-.4 1.6c0 .2-.1.3-.4.2-1.5-.6-2.2-2.3-2.2-4.2 0-3.1 2.6-6.9 7.8-6.9 4.2 0 6.9 3 6.9 6.3 0 4.3-2.4 7.5-5.9 7.5-1.2 0-2.3-.6-2.7-1.4l-.7 2.8c-.3 1-1 2.2-1.5 3 .1 0 .2.1.4.1 3.6 0 7-1.5 9.4-4.1C20.7 17.4 22 14.7 22 11.6 22 6.3 17.5 2 12 2Z" />
        </svg>
      </ShareCircle>
      <ShareCircle
        label="Share on X"
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
      >
        <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden>
          <path d="M14.7 10.3 22.4 2h-1.8l-6.7 7.2L8.5 2H2.1l8.1 11.4L2.1 22h1.8l7-7.6L15.5 22h6.4l-7.2-11.7Zm-2.5 2.7-.8-1.1L4.6 3.3h2.8l5.2 7.2.8 1.1 6.8 9.4h-2.8l-5.2-7Z" />
        </svg>
      </ShareCircle>
      <ShareCircle label="Print article" onClick={() => window.print()}>
        <Printer size={13} strokeWidth={2} aria-hidden />
      </ShareCircle>
    </div>
  )
}
