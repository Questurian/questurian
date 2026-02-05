import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './LandingPage'
import {
  YouTube2BlogPage,
  ArticlesPage,
  ArticleTypesPage,
  ImagePipelinePage
} from './features/youtube2blog'
import { Review2BlogPage } from './features/review2blog'
import './styles.css'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Landing */}
          <Route path="/" element={<LandingPage />} />

          {/* YouTube2Blog Feature */}
          <Route path="/youtube2blog" element={<YouTube2BlogPage />} />
          <Route path="/youtube2blog/articles" element={<ArticlesPage />} />
          <Route path="/youtube2blog/article-types" element={<ArticleTypesPage />} />
          <Route path="/youtube2blog/image-pipeline" element={<ImagePipelinePage />} />

          {/* Review2Blog Feature */}
          <Route path="/review2blog" element={<Review2BlogPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
