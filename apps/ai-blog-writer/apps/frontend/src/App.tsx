import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, LoginPage, RequireAuth } from './features/auth'
import { DashboardPage } from './features/dashboard'
import Layout from './app/layout'
import {
  YouTube2BlogPage,
  ArticlesPage,
  ArticleTypesPage,
  ImagePipelinePage,
  StagePage,
  StageArticlePage
} from './features/youtube2blog'
import { Review2BlogArticlesPage, Review2BlogPage } from './features/review2blog'
import {
  Prompt2BlogPage,
  Prompt2BlogArticlesPage,
  Prompt2BlogStagePage,
  Prompt2BlogStageArticlePage
} from './features/prompt2blog'
import {
  Url2BlogPage,
  Url2BlogArticlesPage,
  Url2BlogStagePage,
  Url2BlogStageArticlePage
} from './features/url2blog'
import {
  SingleTypeListiclesPage,
  SingleTypeListicleBuilderPage,
} from './features/singleTypeListicles'
import {
  ListicleItinerariesPage,
  ListicleItineraryBuilderPage,
} from './features/listicleItineraries'
import { ItinerariesPipelinePage } from './features/itinerariesPipeline'
import {
  LocationDocumentsPage,
  LocationDocumentBuilderPage,
} from './features/locationDocuments'
import {
  HomepageFeaturedContentPage,
  MainHomepagePage,
  LocationHomepagePage,
} from './features/homepageFeaturedContent'
import { KeywordIntelPage } from './features/keywordIntel'
import { ImageRecreationPromptsPage } from './features/imageRecreationPrompts'
import { BatchUploadPage } from './features/batchUpload'
import BatchImageRecreationPage from './features/batchImageRecreation/BatchImageRecreationPage'
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

              {/* YouTube2Blog Feature */}
              <Route path="youtube2blog" element={<YouTube2BlogPage />} />
              <Route path="youtube2blog/articles" element={<ArticlesPage />} />
              <Route path="youtube2blog/article-types" element={<ArticleTypesPage />} />
              <Route path="youtube2blog/image-pipeline" element={<ImagePipelinePage />} />
              <Route path="youtube2blog/stage" element={<StagePage />} />
              <Route path="youtube2blog/stage-article" element={<StageArticlePage />} />

              {/* Review2Blog Feature */}
              <Route path="review2blog" element={<Review2BlogPage />} />
              <Route path="review2blog/articles" element={<Review2BlogArticlesPage />} />

              {/* Prompt2Blog Feature */}
              <Route path="prompt2blog" element={<Prompt2BlogPage />} />
              <Route path="prompt2blog/articles" element={<Prompt2BlogArticlesPage />} />
              <Route path="prompt2blog/stage" element={<Prompt2BlogStagePage />} />
              <Route path="prompt2blog/stage-article" element={<Prompt2BlogStageArticlePage />} />

              {/* URL2Blog Feature */}
              <Route path="url2blog" element={<Url2BlogPage />} />
              <Route path="url2blog/articles" element={<Url2BlogArticlesPage />} />
              <Route path="url2blog/stage" element={<Url2BlogStagePage />} />
              <Route path="url2blog/stage-article" element={<Url2BlogStageArticlePage />} />

              {/* Single Type Listicles */}
              <Route path="single-type-listicles" element={<SingleTypeListiclesPage />} />
              <Route path="single-type-listicles/builder" element={<SingleTypeListicleBuilderPage />} />

              {/* Listicle Itineraries */}
              <Route path="listicle-itineraries" element={<ListicleItinerariesPage />} />
              <Route path="listicle-itineraries/builder" element={<ListicleItineraryBuilderPage />} />

              {/* Itineraries Pipeline */}
              <Route path="itineraries-pipeline" element={<ItinerariesPipelinePage />} />

              {/* Location Documents */}
              <Route path="location-documents" element={<LocationDocumentsPage />} />
              <Route path="location-documents/builder" element={<LocationDocumentBuilderPage />} />

              {/* Homepage Manager */}
              <Route path="homepage-featured-content" element={<HomepageFeaturedContentPage />} />
              <Route path="homepage-featured-content/main" element={<MainHomepagePage />} />
              <Route path="homepage-featured-content/:id" element={<LocationHomepagePage />} />

              {/* Keyword Intel */}
              <Route path="keyword-intel" element={<KeywordIntelPage />} />

              {/* Image Recreation Prompts */}
              <Route path="image-recreation-prompts" element={<ImageRecreationPromptsPage />} />

              {/* Batch Image Upload */}
              <Route path="batch-upload" element={<BatchUploadPage />} />

              {/* Batch Image Recreation */}
              <Route path="batch-image-recreation" element={<BatchImageRecreationPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
