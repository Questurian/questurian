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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="currentColor"/>
            </svg>
          </div>
          <h2>YouTube → Articles</h2>
          <p>Transform YouTube transcripts into clean, polished articles with AI-powered precision.</p>
          <span className="landing-card-action">
            Get Started
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>

        <Link to="/review2blog" className="landing-card landing-card--reviews">
          <div className="landing-card-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>
            </svg>
          </div>
          <h2>Reviews → Articles</h2>
          <p>Turn review data into compelling articles that capture insights and drive engagement.</p>
          <span className="landing-card-action">
            Get Started
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </Link>
      </main>
    </div>
  )
}
