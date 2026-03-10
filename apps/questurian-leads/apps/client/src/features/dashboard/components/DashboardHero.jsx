import { getGreeting } from '../utils/dashboardFormatters';

export default function DashboardHero() {
  return (
    <header className="page-header">
      <h1>{getGreeting()}</h1>
      <p className="page-subtitle">
        Your content intelligence dashboard. Track leads from multiple sources,
        all in one place.
      </p>
    </header>
  );
}
