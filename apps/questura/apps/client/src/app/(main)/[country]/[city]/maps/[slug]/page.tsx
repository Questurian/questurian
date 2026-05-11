import { renderMapsArticleRoute } from '@/features/articles/routes/renderMapsArticleRoute'

type Props = {
  params: Promise<{ country: string; city: string; slug: string }>
}

export default async function MapsArticlePageRoute({ params }: Props) {
  const { country, city, slug } = await params

  return renderMapsArticleRoute({ country, city, slug })
}
