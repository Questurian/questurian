import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../../auth'
import '../../../css/landing.css'

type LandingSectionId =
  | 'article-generation'
  | 'structured-publishing'
  | 'editorial-tools'
  | 'research-seo'
  | 'media-tools'

type LandingCardConfig = {
  id: string
  title: string
  description: string
  to: string
  section: LandingSectionId
  priority: number
  accentClass: string
  actionLabel: string
  icon: ReactNode
  roles?: string[]
}

type LandingSectionConfig = {
  id: LandingSectionId
  title: string
}

const PRIMARY_SECTIONS: LandingSectionConfig[] = [
  {
    id: 'article-generation',
    title: 'Article Generation',
  },
  {
    id: 'structured-publishing',
    title: 'Structured Publishing',
  },
]

const OCCASIONAL_SUBSECTIONS: LandingSectionConfig[] = [
  {
    id: 'editorial-tools',
    title: 'Editorial Utilities',
  },
  {
    id: 'research-seo',
    title: 'Research & SEO',
  },
  {
    id: 'media-tools',
    title: 'Media Tools',
  },
]

function ArrowIcon() {
  return (
    <svg
      className="landing-card-action-icon"
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 12h14M12 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ToggleChevron({ open }: { open: boolean }) {
  return (
    <svg
      className="landing-secondary-toggle-icon"
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transformOrigin: '50% 50%', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      />
    </svg>
  )
}

const LANDING_CARDS: LandingCardConfig[] = [
  {
    id: 'youtube2blog',
    title: 'YouTube → Articles',
    description: 'Transform YouTube transcripts into clean, polished articles with AI-powered precision.',
    to: '/youtube2blog',
    section: 'article-generation',
    priority: 1,
    accentClass: 'landing-card--youtube',
    actionLabel: 'Get Started',
    icon: (
      <path
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
        fill="currentColor"
      />
    ),
  },
  {
    id: 'url2blog',
    title: 'URL → Articles',
    description: 'Extract and structure any web article into clean, reusable content with AI-powered precision.',
    to: '/url2blog',
    section: 'article-generation',
    priority: 3,
    accentClass: 'landing-card--url2blog',
    actionLabel: 'Get Started',
    icon: (
      <>
        <path
          d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'prompt2blog',
    title: 'Prompt → Articles',
    description: 'Fill out content parameters and let AI craft polished, publish-ready articles from your raw material.',
    to: '/prompt2blog',
    section: 'article-generation',
    priority: 4,
    accentClass: 'landing-card--prompt2blog',
    actionLabel: 'Get Started',
    icon: (
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: 'single-type-listicles',
    title: 'Single Type Listicles',
    description: 'Build and stage Single Type Listicles directly with full Payload field and block control.',
    to: '/single-type-listicles',
    section: 'structured-publishing',
    priority: 1,
    accentClass: 'landing-card--single-listicles',
    actionLabel: 'Open Builder',
    icon: (
      <path
        d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: 'listicle-itineraries',
    title: 'Listicle Itineraries',
    description: 'Build and stage timeline-based itineraries with block-level scheduling and Payload sync.',
    to: '/listicle-itineraries',
    section: 'structured-publishing',
    priority: 2,
    accentClass: 'landing-card--itineraries',
    actionLabel: 'Open Builder',
    icon: (
      <path
        d="M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h6v6h-6v-6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: 'itineraries-pipeline',
    title: 'Itineraries Pipeline',
    description: 'Run and manage the itineraries pipeline workflow from a single place.',
    to: '/itineraries-pipeline',
    section: 'structured-publishing',
    priority: 3,
    accentClass: 'landing-card--itineraries-pipeline',
    actionLabel: 'Open Pipeline',
    icon: (
      <>
        <path
          d="M4 19h16M6 5v10M10 5v10M14 5v10M18 5v10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 9h4M12 13h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'location-documents',
    title: 'Location Images',
    description: 'Set the single top-level cover image for existing Payload locations with local change tracking.',
    to: '/location-documents',
    section: 'structured-publishing',
    priority: 4,
    accentClass: 'landing-card--locations',
    actionLabel: 'Open Images',
    icon: (
      <>
        <path
          d="M5 4h14v16H5V4z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 8h8M8 12h8M8 16h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 2v4M10 2v4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'homepage-featured-content',
    title: 'Homepage Featured Content',
    description: 'Manage the exact 10 front-page content slots shared with Payload and the site homepage.',
    to: '/homepage-featured-content',
    section: 'structured-publishing',
    priority: 5,
    accentClass: 'landing-card--locations',
    actionLabel: 'Open Manager',
    roles: ['admin', 'editor'],
    icon: (
      <>
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 9h10M7 13h10M7 17h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'keyword-intel',
    title: 'Keyword Intel',
    description: 'Collect autocomplete and related-search phrasing, cluster the intent, and surface ranked opportunities without drafting articles.',
    to: '/keyword-intel',
    section: 'research-seo',
    priority: 1,
    accentClass: 'landing-card--keyword-intel',
    actionLabel: 'Open Intel',
    icon: (
      <>
        <path
          d="M4 6h16M4 12h10M4 18h7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 12l2 2 4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'image-recreation-prompts',
    title: 'Image Recreation Prompts',
    description: 'Upload 1 primary photo and up to 7 extra reference photos, then run FLUX.2 Max, Pro, or Flex edits from one prompt-building screen.',
    to: '/image-recreation-prompts',
    section: 'media-tools',
    priority: 1,
    accentClass: 'landing-card--image-prompts',
    actionLabel: 'Open Tool',
    icon: (
      <>
        <path
          d="M4 6h16v12H4V6z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 13l2.5-2.5 2 2 3.5-3.5L20 13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 10h.01"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'batch-image-recreation',
    title: 'Batch Image Recreation',
    description: 'Drop multiple reference photos, pick a FLUX.2 model, write one prompt and generate a single recreated image using all references.',
    to: '/batch-image-recreation',
    section: 'media-tools',
    priority: 2,
    accentClass: 'landing-card--batch-image-recreation',
    actionLabel: 'Open Tool',
    icon: (
      <>
        <rect
          x="2"
          y="3"
          width="9"
          height="9"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="13"
          y="3"
          width="9"
          height="9"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="2"
          y="14"
          width="9"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="13"
          y="14"
          width="9"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 7l1.5 1.5L12 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: 'media-library',
    title: 'Media Library',
    description: 'Browse, audit, and edit Payload MediaSets. Find missing alt text, detect orphaned assets, bulk-generate AI alt text, and upload new images.',
    to: '/media-library',
    section: 'media-tools',
    priority: 3,
    accentClass: 'landing-card--media-library',
    actionLabel: 'Open Library',
    icon: (
      <>
        <rect
          x="3"
          y="3"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="14"
          y="3"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="3"
          y="14"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="14"
          y="14"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
]

function getCardsForSection(sectionId: LandingSectionId, role?: string | null) {
  return LANDING_CARDS
    .filter((card) => !card.roles || (role ? card.roles.includes(role) : false))
    .filter((card) => card.section === sectionId)
    .sort((left, right) => left.priority - right.priority)
}

function LandingCard({ card }: { card: LandingCardConfig }) {
  return (
    <Link to={card.to} className={`landing-card ${card.accentClass}`}>
      <div className="landing-card-icon">
        <svg
          className="landing-card-main-icon"
          aria-hidden="true"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {card.icon}
        </svg>
      </div>
      <h3>{card.title}</h3>
      <p>{card.description}</p>
      <span className="landing-card-action">
        {card.actionLabel}
        <ArrowIcon />
      </span>
    </Link>
  )
}

function LandingSection({
  section,
  role,
}: {
  section: LandingSectionConfig
  role?: string | null
}) {
  const cards = getCardsForSection(section.id, role)

  return (
    <section className="landing-section" aria-labelledby={`landing-section-${section.id}`}>
      <div className="landing-section-header">
        <div>
          <p className="landing-section-kicker">Primary Domain</p>
          <h2 id={`landing-section-${section.id}`}>{section.title}</h2>
        </div>
      </div>
      <div className="landing-section-grid">
        {cards.map((card) => (
          <LandingCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const auth = useContext(AuthContext)
  const [isOccasionalOpen, setIsOccasionalOpen] = useState(false)
  const currentRole = auth?.user?.role || null
  const occasionalToolCount = LANDING_CARDS.filter((card) => (
    OCCASIONAL_SUBSECTIONS.some((section) => section.id === card.section)
    && (!card.roles || (currentRole ? card.roles.includes(currentRole) : false))
  )).length

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <p className="landing-eyebrow">Questurian Studio</p>
        <h1>AI <span className="landing-highlight">Tools</span></h1>
        <p className="landing-lede">Choose a tool to get started.</p>
      </header>

      <main className="landing-sections">
        {PRIMARY_SECTIONS.map((section) => (
          <LandingSection key={section.id} section={section} role={currentRole} />
        ))}

        <section className="landing-section landing-section--secondary" aria-labelledby="landing-occasional-heading">
          <div className="landing-secondary-shell">
            <div className="landing-section-header landing-section-header--secondary">
              <div>
                <p className="landing-section-kicker">Secondary Access</p>
                <h2 id="landing-occasional-heading">Occasional Tools</h2>
              </div>
            </div>

            <button
              type="button"
              className="landing-secondary-toggle"
              aria-expanded={isOccasionalOpen}
              aria-controls="landing-occasional-content"
              onClick={() => setIsOccasionalOpen((open) => !open)}
            >
              <span className="landing-secondary-toggle-copy">
                <span className="landing-secondary-toggle-label">
                  {isOccasionalOpen ? 'Hide occasional tools' : 'Show occasional tools'}
                </span>
                <span className="landing-secondary-toggle-meta">
                  {occasionalToolCount} tools
                </span>
              </span>
              <ToggleChevron open={isOccasionalOpen} />
            </button>

            {isOccasionalOpen ? (
              <div id="landing-occasional-content" className="landing-secondary-content">
                {OCCASIONAL_SUBSECTIONS.map((section) => (
                  <section
                    key={section.id}
                    className="landing-subsection"
                    aria-labelledby={`landing-subsection-${section.id}`}
                  >
                    <div className="landing-subsection-header">
                      <h3 id={`landing-subsection-${section.id}`}>{section.title}</h3>
                    </div>
                    <div className="landing-section-grid">
                      {getCardsForSection(section.id, currentRole).map((card) => (
                        <LandingCard key={card.id} card={card} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
