import { renderItineraryArticleRoute } from '@/features/articles/routes/renderItineraryArticleRoute'

type Props = {
  params: Promise<{ country: string; city: string; slug: string }>
}

export default async function ItineraryArticlePageRoute({ params }: Props) {
  const { country, city, slug } = await params

  return renderItineraryArticleRoute({ country, city, slug })
}
