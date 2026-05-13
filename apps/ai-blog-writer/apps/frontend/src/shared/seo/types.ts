export type SeoTwitterCardType = 'summary' | 'summary_large_image'

export type SeoSection = {
  seoTitle: string
  metaDescription: string
  openGraph: {
    title: string
    description: string
    imageUrl: string
    url: string
  }
  twitterCard: {
    card: SeoTwitterCardType
    title: string
    description: string
    imageUrl: string
  }
  structuredData: string
  robots: {
    index: 'index' | 'noindex'
    follow: 'follow' | 'nofollow'
  }
}
