import Link from 'next/link'

export function NavigableImageTarget({
  href,
  label,
  external = false,
}: {
  href: string | null | undefined
  label: string
  external?: boolean
}) {
  if (!href) return null
  const className =
    'absolute inset-0 z-20 outline-none transition-colors duration-200 hover:bg-background/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'
  if (external) {
    return (
      <a
        href={href}
        aria-label={label}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      />
    )
  }
  return <Link href={href} aria-label={label} className={className} />
}
