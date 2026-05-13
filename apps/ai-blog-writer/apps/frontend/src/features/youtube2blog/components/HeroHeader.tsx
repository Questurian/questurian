import { Link } from 'react-router-dom'

type HeroHeaderProps = {
  activeBadge: string
}

export function HeroHeader({ activeBadge }: HeroHeaderProps) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Questurian Studio</p>
        <h1>
          Turn YouTube videos into <span className="underline-text">clean articles</span>
          <span className="orange-dot">.</span>
        </h1>
        <p className="lede">
          Paste a YouTube URL, extract transcript automatically, and generate polished articles
          with AI-powered precision.
        </p>
      </div>
      <div className="badge-row">
        <div className="badge">{activeBadge}</div>
        <Link to="/" className="nav-link">
          ← Home
        </Link>
        <Link to="/youtube2blog/articles" className="nav-link">
          Saved Articles
        </Link>
        <Link to="/youtube2blog/article-types" className="nav-link">
          Article Types
        </Link>
      </div>
    </header>
  )
}
