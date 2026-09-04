import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, LoginPage, RequireAuth } from './features/auth'
import { DashboardPage } from './features/dashboard'
import { ClaudeConnectionPage } from './features/claudeConnection'
import Layout from './app/layout'
import {
  Prompt2BlogPage,
  Prompt2BlogArticlesPage,
  Prompt2BlogStagePage,
  Prompt2BlogStageArticlePage
} from './features/prompt2blog'
import {
  SingleTypeListiclesPage,
  SingleTypeListicleBuilderPage,
} from './features/singleTypeListicles'
import {
  ListicleItinerariesPage,
  ListicleItineraryBuilderPage,
} from './features/listicleItineraries'
import { ItinerariesPipelinePage } from './features/itinerariesPipeline'
import { ListiclePipelinePage } from './features/listiclePipeline'
import {
  PayloadArticlesPage,
  PayloadArticleStagePage,
} from './features/payloadArticles'
import {
  LocationDocumentsPage,
  LocationDocumentBuilderPage,
} from './features/locationDocuments'
import {
  HomepageFeaturedContentPage,
  MainHomepagePage,
  LocationHomepagePage,
} from './features/homepageFeaturedContent'
import { ImageRecreationPromptsPage } from './features/imageRecreationPrompts'
import { MediaLibraryPage } from './features/mediaLibrary'
import BatchImageRecreationPage from './features/batchImageRecreation/BatchImageRecreationPage'
import {
  AuthorDirectoryPage,
  AuthorProfilePage,
  MyProfilePage,
  StaffPage,
  StaffProfilePage,
} from './features/staff'
import './styles.css'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected Routes */}
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              {/* Landing */}
              <Route index element={<DashboardPage />} />

              {/* Prompt2Blog Feature */}
              <Route path="prompt2blog" element={<Prompt2BlogPage />} />
              <Route path="prompt2blog/articles" element={<Prompt2BlogArticlesPage />} />
              <Route path="prompt2blog/stage" element={<Prompt2BlogStagePage />} />
              <Route path="prompt2blog/stage-article" element={<Prompt2BlogStageArticlePage />} />

              {/* URL2Blog Feature */}

              {/* Payload Articles (cross-pipeline editor) */}
              <Route path="payload-articles" element={<PayloadArticlesPage />} />
              <Route path="payload-articles/stage-article" element={<PayloadArticleStagePage />} />

              {/* Single Type Listicles */}
              <Route path="single-type-listicles" element={<SingleTypeListiclesPage />} />
              <Route path="single-type-listicles/builder" element={<SingleTypeListicleBuilderPage />} />

              {/* Listicle Itineraries */}
              <Route path="listicle-itineraries" element={<ListicleItinerariesPage />} />
              <Route path="listicle-itineraries/builder" element={<ListicleItineraryBuilderPage />} />

              {/* Itineraries Pipeline */}
              <Route path="itineraries-pipeline" element={<ItinerariesPipelinePage />} />

              {/* Listicle Pipeline */}
              <Route path="listicle-pipeline" element={<ListiclePipelinePage />} />

              {/* Location Images */}
              <Route path="location-documents" element={<LocationDocumentsPage />} />
              <Route path="location-documents/builder" element={<LocationDocumentBuilderPage />} />

              {/* Homepage Manager */}
              <Route path="homepage-featured-content" element={<HomepageFeaturedContentPage />} />
              <Route path="homepage-featured-content/main" element={<MainHomepagePage />} />
              <Route path="homepage-featured-content/:id" element={<LocationHomepagePage />} />

              {/* Image Recreation Prompts */}
              <Route path="image-recreation-prompts" element={<ImageRecreationPromptsPage />} />

              {/* Media Library */}
              <Route path="media-library" element={<MediaLibraryPage />} />

              {/* Batch Image Recreation */}
              <Route path="batch-image-recreation" element={<BatchImageRecreationPage />} />

              {/* Claude subscription connection */}
              <Route path="settings/claude" element={<ClaudeConnectionPage />} />

              {/* Staff management */}
              <Route path="profile" element={<MyProfilePage />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="staff/:id" element={<StaffProfilePage />} />

              {/* Author Directory -- editor-reachable, keyed by author id */}
              <Route path="authors" element={<AuthorDirectoryPage />} />
              <Route path="authors/:id" element={<AuthorProfilePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
