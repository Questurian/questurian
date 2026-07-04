import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export type MarkdownCatalogItem = {
  id: string | number
  label: string
  description?: string | null
  markdown?: string | null
}

type MarkdownCatalogBoxProps = {
  title: string
  intro: string
  items: MarkdownCatalogItem[]
  emptyLabel: string
}

export function MarkdownCatalogBox({ title, intro, items, emptyLabel }: MarkdownCatalogBoxProps) {
  return (
    <section className="markdown-catalog-box">
      <div className="markdown-catalog-box__header">
        <h3>{title}</h3>
        <p>{intro}</p>
      </div>
      <div className="markdown-catalog-box__list">
        {items.length ? items.map((item, index) => {
          const markdown = item.markdown?.trim() || item.description?.trim() || emptyLabel
          return (
            <details key={item.id} className="markdown-catalog-box__item" open={index === 0}>
              <summary>
                <span>{item.label}</span>
                {item.description ? <small>{item.description}</small> : null}
              </summary>
              <div className="markdown-catalog-box__markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            </details>
          )
        }) : (
          <p className="markdown-catalog-box__empty">{emptyLabel}</p>
        )}
      </div>
    </section>
  )
}
