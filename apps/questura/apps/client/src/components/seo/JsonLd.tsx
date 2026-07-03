type JsonLdProps = {
  data: unknown
}

/**
 * Renders a schema.org JSON-LD script tag. `<` is escaped so stored content
 * can never break out of the script element.
 */
export function JsonLd({ data }: JsonLdProps) {
  if (!data || typeof data !== 'object') return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
