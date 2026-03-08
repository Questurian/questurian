import { Link } from 'react-router-dom'
import './css/landing.css'

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-hero">
        <p className="landing-eyebrow">Questurian Studio</p>
        <h1>Transform content into <span className="landing-highlight">articles</span></h1>
        <p className="landing-lede">
          Choose your content source and let AI create polished, professional articles.
        </p>
      </header>

      <main className="landing-options">
        <Link to="/youtube2blog" className="landing-card landing-card--youtube">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="currentColor"/>
            </svg>
          </div>
          <h2>YouTube → Articles</h2>
          <p>Transform YouTube transcripts into clean, polished articles with AI-powered precision.</p>
          <span className="landing-card-action">
            Get Started
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>

        <Link to="/review2blog" className="landing-card landing-card--reviews">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>
            </svg>
          </div>
          <h2>Reviews → Articles</h2>
          <p>Turn review data into compelling articles that capture insights and drive engagement.</p>
          <span className="landing-card-action">
            Get Started
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>
        <Link to="/url2blog" className="landing-card landing-card--url2blog">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>URL &rarr; Articles</h2>
          <p>Extract and structure any web article into clean, reusable content with AI-powered precision.</p>
          <span className="landing-card-action">
            Get Started
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>
        <Link to="/prompt2blog" className="landing-card landing-card--prompt2blog">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>Prompt &rarr; Articles</h2>
          <p>Fill out content parameters and let AI craft polished, publish-ready articles from your raw material.</p>
          <span className="landing-card-action">
            Get Started
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>

        <Link to="/single-type-listicles" className="landing-card landing-card--single-listicles">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>Single Type Listicles</h2>
          <p>Build and stage Single Type Listicles directly with full Payload field and block control.</p>
          <span className="landing-card-action">
            Open Builder
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>

        <Link to="/listicle-itineraries" className="landing-card landing-card--itineraries">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h6v6h-6v-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>Listicle Itineraries</h2>
          <p>Build and stage timeline-based itineraries with block-level scheduling and Payload sync.</p>
          <span className="landing-card-action">
            Open Builder
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>

        <Link to="/location-documents" className="landing-card landing-card--locations">
          <div className="landing-card-icon">
            <svg className="landing-card-main-icon" aria-hidden="true" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 4h14v16H5V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v4M10 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>Location Documents</h2>
          <p>Compose and sync full Payload location hierarchy documents with shared guide sections, mode-specific content, and AI assist.</p>
          <span className="landing-card-action">
            Open Builder
            <svg className="landing-card-action-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>
      </main>
    </div>
  )
}
