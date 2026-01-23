import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import Countries from './pages/Countries';
import Feeds from './pages/Feeds';
import InstagramFeeds from './pages/InstagramFeeds';
import ElComercioFeeds from './pages/ElComercioFeeds';
import Tags from './pages/Tags';
import Leads from './pages/Leads';
import InstagramPosts from './pages/InstagramPosts';
import ManageScrapes from './pages/ManageScrapes';
import Subreddits from './pages/Subreddits';
import SubredditBrowser from './pages/SubredditBrowser';
import FetchLogs from './pages/FetchLogs';
import ApprovalQueue from './pages/ApprovalQueue';
import YouTubeFeeds from './pages/YouTubeFeeds';
import YouTubePosts from './pages/YouTubePosts';
import BatchFetch from './pages/BatchFetch';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route
            index
            element={(
              <Suspense fallback={<div className="loading">Loading dashboard...</div>}>
                <Dashboard />
              </Suspense>
            )}
          />
          <Route path="settings" element={<Settings />} />
          <Route path="approval" element={<ApprovalQueue />} />
          <Route path="categories" element={<Categories />} />
          <Route path="countries" element={<Countries />} />
          <Route path="feeds" element={<Feeds />} />
          <Route path="instagram-feeds" element={<InstagramFeeds />} />
          <Route path="el-comercio-feeds" element={<ElComercioFeeds />} />
          <Route path="subreddits" element={<Subreddits />} />
          <Route path="subreddit-browser" element={<SubredditBrowser />} />
          <Route path="tags" element={<Tags />} />
          <Route path="leads" element={<Leads />} />
          <Route path="instagram-posts" element={<InstagramPosts />} />
          <Route path="youtube-feeds" element={<YouTubeFeeds />} />
          <Route path="youtube-posts" element={<YouTubePosts />} />
          <Route path="scrapes/manage" element={<ManageScrapes />} />
          <Route path="logs" element={<FetchLogs />} />
          <Route path="batch-fetch" element={<BatchFetch />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
