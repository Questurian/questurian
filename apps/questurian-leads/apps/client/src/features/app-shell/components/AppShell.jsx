import AppShellBrand from './AppShellBrand';
import AppShellDesktopMenu from './AppShellDesktopMenu';
import AppShellMobileMenu from './AppShellMobileMenu';

export default function AppShell({
  children,
  data,
  menu,
}) {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <AppShellBrand />

          <button
            className="nav-menu-toggle"
            aria-expanded={menu.isMobileMenuOpen}
            aria-label="Toggle navigation menu"
            onClick={menu.toggleMobileMenu}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <AppShellDesktopMenu
            isJobRunning={data.isJobRunning}
            isSettingsDropdownOpen={menu.isSettingsDropdownOpen}
            onLogout={menu.handleLogout}
            onToggleSettingsDropdown={menu.toggleSettingsDropdown}
            totalPending={data.totalPending}
            user={data.user}
          />
        </div>

        <AppShellMobileMenu
          isJobRunning={data.isJobRunning}
          isMobileMenuOpen={menu.isMobileMenuOpen}
          onLogout={menu.handleLogout}
          totalPending={data.totalPending}
        />
      </nav>

      <main className="container">{children}</main>
    </div>
  );
}
