import { Link } from 'react-router-dom';
import AppShellIcon from './AppShellIcon';

export default function AppShellNavItem({
  isJobRunning,
  item,
  totalPending,
}) {
  return (
    <Link to={item.to} className={item.className}>
      <AppShellIcon name={item.icon} />
      {item.label}
      {item.badge === 'job' && isJobRunning && (
        <span
          className="nav-job-indicator"
          title="Batch fetch is running"
          aria-label="Batch fetch is running"
        />
      )}
      {item.badge === 'pending' && totalPending > 0 && (
        <span className="nav-notification-badge">{totalPending}</span>
      )}
    </Link>
  );
}
