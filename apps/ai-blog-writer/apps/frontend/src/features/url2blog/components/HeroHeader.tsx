import { Link } from 'react-router-dom'

export function HeroHeader() {
  return (
    <header className="url2blog-hero">
      <div>
        <p className="url2blog-eyebrow">Questurian Studio</p>
        <h1>
          Turn any article into <span className="url2blog-underline-text">a guideline-aligned draft</span>
          <span className="url2blog-teal-dot">.</span>
        </h1>
        <p className="url2blog-lede">Simple flow: extract, classify, rewrite, and return clean Markdown.</p>
      </div>
      <div className="url2blog-badge-row">
        <Link to="/" className="url2blog-nav-link">&larr; Home</Link>
        <Link to="/url2blog/articles" className="url2blog-nav-link">Saved Articles</Link>
      </div>
    </header>
  )
}
