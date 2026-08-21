import type { JSX } from 'react'
import type { AuthorSocialLinks, AuthorSocialPlatform } from '@/features/authors/lib/fetchAuthor'

export type SocialPlatform = {
  key: AuthorSocialPlatform
  /** Field on AuthorSocialLinks holding this platform's author URL. */
  linkKey: keyof AuthorSocialLinks
  label: string
  iconPath: string
}

export const AUTHOR_SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    key: 'instagram',
    linkKey: 'instagram',
    label: 'Instagram',
    iconPath:
      'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z',
  },
  {
    key: 'twitter',
    linkKey: 'twitter',
    label: 'X',
    iconPath:
      'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  },
  {
    key: 'facebook',
    linkKey: 'facebook',
    label: 'Facebook',
    iconPath:
      'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
  {
    key: 'linkedin',
    linkKey: 'linkedin',
    label: 'LinkedIn',
    iconPath:
      'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    key: 'reddit',
    linkKey: 'reddit',
    label: 'Reddit',
    iconPath:
      'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
  },
  {
    key: 'youtube',
    linkKey: 'youtube',
    label: 'YouTube',
    iconPath:
      'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    key: 'patreon',
    linkKey: 'patreon',
    label: 'Patreon',
    iconPath:
      'M0 .48v23.04h4.22V.48zm15.385 0c-4.764 0-8.641 3.88-8.641 8.65 0 4.755 3.877 8.623 8.641 8.623 4.75 0 8.615-3.868 8.615-8.623C24 4.36 20.136.48 15.385.48z',
  },
  {
    key: 'website',
    linkKey: 'website',
    label: 'Website',
    iconPath:
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.92 6h-3.03a15.7 15.7 0 0 0-1.38-3.56A8.05 8.05 0 0 1 18.92 8ZM12 4c.83 1.2 1.48 2.53 1.82 4h-3.64A13.7 13.7 0 0 1 12 4ZM4.26 14a7.8 7.8 0 0 1 0-4h3.39a16.5 16.5 0 0 0 0 4H4.26Zm.82 2h3.03c.3 1.27.77 2.47 1.38 3.56A8.05 8.05 0 0 1 5.08 16ZM8.11 8H5.08a8.05 8.05 0 0 1 4.41-3.56A15.7 15.7 0 0 0 8.11 8ZM12 20a13.7 13.7 0 0 1-1.82-4h3.64A13.7 13.7 0 0 1 12 20Zm2.22-6H9.78a14.5 14.5 0 0 1 0-4h4.44a14.5 14.5 0 0 1 0 4Zm.29 5.56A15.7 15.7 0 0 0 15.89 16h3.03a8.05 8.05 0 0 1-4.41 3.56ZM16.35 14a16.5 16.5 0 0 0 0-4h3.39a7.8 7.8 0 0 1 0 4h-3.39Z',
  },
]

export function AuthorSocialIconLink({
  platform,
  href,
  authorName,
  className = 'text-foreground/60 transition-colors hover:text-foreground',
  iconClassName = 'size-[18px]',
}: {
  platform: SocialPlatform
  href: string
  authorName: string
  className?: string
  iconClassName?: string
}): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${authorName} on ${platform.label}`}
      className={className}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className={iconClassName} aria-hidden="true">
        <path d={platform.iconPath} fillRule="evenodd" />
      </svg>
    </a>
  )
}

export function AuthorSocialIcons({
  links,
  authorName,
}: {
  links: AuthorSocialLinks | null
  authorName: string
}): JSX.Element | null {
  // Only platforms the author actually linked get a badge.
  const linked = AUTHOR_SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    href: links?.[platform.linkKey] || null,
  })).filter((entry): entry is { platform: SocialPlatform; href: string } => Boolean(entry.href))

  if (linked.length === 0) return null

  return (
    <div className="flex items-center gap-3.5">
      {linked.map(({ platform, href }) => (
        <AuthorSocialIconLink
          key={platform.key}
          platform={platform}
          href={href}
          authorName={authorName}
        />
      ))}
    </div>
  )
}
