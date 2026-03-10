import { Link } from 'react-router-dom';
import {
  APP_SHELL_SETTINGS_LINK,
  APP_SHELL_STATUS_LINKS,
} from '../constants/appShellNavigation.constants';
import AppShellIcon from './AppShellIcon';
import AppShellNavItem from './AppShellNavItem';

export default function AppShellSettingsMenu({
  isJobRunning,
  onLogout,
  totalPending,
}) {
  return (
    <div className="nav-dropdown-menu">
      {APP_SHELL_STATUS_LINKS.map((item) => (
        <AppShellNavItem
          key={item.key}
          item={item}
          isJobRunning={isJobRunning}
          totalPending={totalPending}
        />
      ))}
      <Link to={APP_SHELL_SETTINGS_LINK.to}>
        <AppShellIcon name={APP_SHELL_SETTINGS_LINK.icon} />
        {APP_SHELL_SETTINGS_LINK.label}
      </Link>
      <button
        type="button"
        className="nav-dropdown-button"
        onClick={onLogout}
      >
        <AppShellIcon name="logout" />
        Log out
      </button>
    </div>
  );
}
