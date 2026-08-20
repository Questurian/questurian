'use client'

import { useCallback, useEffect, useId, useState, type JSX, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Link2, Printer, Share2, X } from 'lucide-react'
import { getPublicBaseUrl } from '@/lib/seo/publicBaseUrl'

const articleShareTriggerClass =
  'inline-flex items-center gap-1.5 font-display text-[10px] uppercase leading-none tracking-[0.18em] text-foreground transition-opacity hover:opacity-70 active:opacity-100 380:text-[11px]'

type ArticleShareButtonProps = {
  title: string
  imageUrl?: string | null
  url?: string
}

function FacebookIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v3H6v4h3v8h4v-8h3.2l.8-4H13V9c0-.6.4-1 1-1Z" />
    </svg>
  )
}

function PinterestIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M12 2C6.5 2 2 6.3 2 11.6c0 4 2.5 7.4 6.1 8.6-.1-.7-.2-1.8 0-2.6.2-.7 1.4-6 1.4-6s-.4-.7-.4-1.8c0-1.7 1-3 2.2-3 1 0 1.5.8 1.5 1.7 0 1-.7 2.6-1 4-.3 1.2.6 2.2 1.8 2.2 2.1 0 3.6-2.7 3.6-5.9 0-2.4-1.6-4.2-4.6-4.2-3.3 0-5.4 2.5-5.4 5.2 0 1 .5 2.1 1 2.7.1.1.1.2.1.3l-.4 1.6c0 .2-.1.3-.4.2-1.5-.6-2.2-2.3-2.2-4.2 0-3.1 2.6-6.9 7.8-6.9 4.2 0 6.9 3 6.9 6.3 0 4.3-2.4 7.5-5.9 7.5-1.2 0-2.3-.6-2.7-1.4l-.7 2.8c-.3 1-1 2.2-1.5 3 .1 0 .2.1.4.1 3.6 0 7-1.5 9.4-4.1C20.7 17.4 22 14.7 22 11.6 22 6.3 17.5 2 12 2Z" />
    </svg>
  )
}

function XIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden>
      <path d="M14.7 10.3 22.4 2h-1.8l-6.7 7.2L8.5 2H2.1l8.1 11.4L2.1 22h1.8l7-7.6L15.5 22h6.4l-7.2-11.7Zm-2.5 2.7-.8-1.1L4.6 3.3h2.8l5.2 7.2.8 1.1 6.8 9.4h-2.8l-5.2-7Z" />
    </svg>
  )
}

const optionClass =
  'flex w-full items-center gap-3 px-4 py-3 text-left font-display text-[14px] text-foreground transition-colors hover:bg-foreground/[0.04]'

function ShareOption({
  href,
  onClick,
  icon,
  label,
}: {
  href?: string
  onClick?: () => void
  icon: ReactNode
  label: string
}): JSX.Element {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={optionClass}
      >
        <span className="flex size-5 items-center justify-center text-foreground">{icon}</span>
        {label}
      </a>
    )
  }

  return (
    <button type="button" className={optionClass} onClick={onClick}>
      <span className="flex size-5 items-center justify-center text-foreground">{icon}</span>
      {label}
    </button>
  )
}

export function ArticleShareButton({
  title,
  imageUrl,
  url,
}: ArticleShareButtonProps): JSX.Element {
  const pathname = usePathname()
  const shareUrl = url ?? `${getPublicBaseUrl()}${pathname}`
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const titleId = useId()
  const dialogId = useId()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, close])

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  function printArticle(): void {
    close()
    window.setTimeout(() => window.print(), 0)
  }

  const encodedUrl = encodeURIComponent(shareUrl)
  const encodedTitle = encodeURIComponent(title)
  const encodedImage = imageUrl ? encodeURIComponent(imageUrl) : ''

  return (
    <div className="inline-flex" data-article-share>
      <button
        type="button"
        className={articleShareTriggerClass}
        aria-label="Share article"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(true)}
      >
        <Share2 size={13} strokeWidth={1.75} aria-hidden="true" />
        Share
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={close}
          />
          <div
            id={dialogId}
            className="relative z-[101] w-full max-w-sm rounded-t-lg bg-background shadow-lg sm:rounded-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="flex items-start justify-between gap-3 border-b border-foreground/10 px-4 py-3">
              <h2
                id={titleId}
                className="pr-2 font-display text-[1.05rem] font-semibold leading-tight text-foreground"
              >
                Share
              </h2>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-sm p-1 text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
                aria-label="Close share"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex flex-col py-1">
              <ShareOption
                icon={<Link2 size={16} strokeWidth={2} aria-hidden />}
                label={copied ? 'Link copied' : 'Copy link'}
                onClick={copyLink}
              />
              <ShareOption
                icon={<FacebookIcon />}
                label="Facebook"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
              />
              <ShareOption
                icon={<PinterestIcon />}
                label="Pinterest"
                href={`https://www.pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}${encodedImage ? `&media=${encodedImage}` : ''}`}
              />
              <ShareOption
                icon={<XIcon />}
                label="X"
                href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
              />
              <ShareOption
                icon={<Printer size={16} strokeWidth={2} aria-hidden />}
                label="Print"
                onClick={printArticle}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
