import { formatNumber } from '../utils/dashboardFormatters';

export default function DashboardStatsGrid({ isRefreshing, stats }) {
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total Items</div>
          <div className="stat-card-value">{formatNumber(stats.total)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Articles</div>
          <div className="stat-card-value">{formatNumber(stats.articles)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Instagram</div>
          <div className="stat-card-value">{formatNumber(stats.instagram)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Sources</div>
          <div className="stat-card-value">{formatNumber(stats.sources)}</div>
        </div>
      </div>

      {isRefreshing && <div className="badge warning">Refreshing...</div>}
    </>
  );
}
