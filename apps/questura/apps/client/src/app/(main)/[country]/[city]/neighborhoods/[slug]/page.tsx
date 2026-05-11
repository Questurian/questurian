import { renderStandardArticleRoute } from '@/features/articles/routes/renderStandardArticleRoute'

type Props = {
  params: Promise<{ country: string; city: string; slug: string }>
}

export default async function NeighborhoodsArticlePageRoute({ params }: Props) {
  const { country, city, slug } = await params

  return renderStandardArticleRoute({
    country,
    city,
    slug,
    type: 'neighborhoods',
  })
}
