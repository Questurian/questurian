import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useApprovalStats } from '../hooks/useApproval';
import { useBatchFetchCurrent } from '../hooks/useBatchFetch';
import { useAuth } from '../providers/AuthProvider';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Get approval stats for notification badge
  const { data: approvalStats } = useApprovalStats();
  const { data: currentJob } = useBatchFetchCurrent();
  const isJobRunning = currentJob && ['queued', 'running'].includes(currentJob.status);

  // Calculate total pending items
  const totalPending = approvalStats ? Object.values(approvalStats).reduce((total, stats) => total + stats.pending, 0) : 0;

  // Close mobile menu and dropdown when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSettingsDropdownOpen(false);
  }, [location]);

  // Close mobile menu and dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobileMenuOpen && !event.target.closest('.navbar')) {
        setIsMobileMenuOpen(false);
      }
      if (isSettingsDropdownOpen && !event.target.closest('.nav-dropdown')) {
        setIsSettingsDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobileMenuOpen, isSettingsDropdownOpen]);

  // Close mobile menu and dropdown on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsSettingsDropdownOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobileMenuOpen, isSettingsDropdownOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const toggleSettingsDropdown = () => {
    setIsSettingsDropdownOpen(!isSettingsDropdownOpen);
  };

  const handleLogout = () => {
    setIsSettingsDropdownOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand">
            <Link to="/" className="nav-brand-link">
              <h1>Questurian Leads</h1>
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="nav-menu-toggle"
            aria-expanded={isMobileMenuOpen}
            aria-label="Toggle navigation menu"
            onClick={toggleMobileMenu}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          {/* Desktop Actions */}
          <div className="nav-actions">
            {user?.role ? (
              <span className="nav-role-badge">Role: {user.role}</span>
            ) : null}
            <div className="nav-dropdown">
              <button
                className="nav-link-icon nav-dropdown-toggle"
                aria-label="Settings menu"
                title="Settings menu"
                onClick={toggleSettingsDropdown}
                aria-expanded={isSettingsDropdownOpen}
              >
                <svg
                  className="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
              {isSettingsDropdownOpen && (
                <div className="nav-dropdown-menu">
                  <Link to="/batch-fetch" className="nav-link-status">
                    Daily Fetch
                    {isJobRunning && (
                      <span
                        className="nav-job-indicator"
                        title="Batch fetch is running"
                        aria-label="Batch fetch is running"
                      />
                    )}
                  </Link>
                  <Link to="/approval" className="nav-link-approval">
                    Approval Queue
                    {totalPending > 0 && (
                      <span className="nav-notification-badge">
                        {totalPending}
                      </span>
                    )}
                  </Link>
                  <Link to="/settings">Settings</Link>
                  <button type="button" className="nav-dropdown-button" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <div className="nav-mobile-menu" aria-expanded={isMobileMenuOpen}>
          <Link to="/batch-fetch" className="nav-link-status">
            Daily Fetch
            {isJobRunning && (
              <span
                className="nav-job-indicator"
                title="Batch fetch is running"
                aria-label="Batch fetch is running"
              />
            )}
          </Link>
          <Link to="/settings" className="nav-link-icon" aria-label="Settings">
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
          </Link>
        </div>
      </nav>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
