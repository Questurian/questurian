export const ARTICLE_GRID_FOUR_LAYOUT_VALUES = ['four-across', 'two-by-two'] as const

export type ArticleGridFourLayout = (typeof ARTICLE_GRID_FOUR_LAYOUT_VALUES)[number]
