import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isConnected, connectionError } = useAuth();

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMobileMenuOpen && !(event.target as Element).closest('.navbar')) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobileMenuOpen]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const connectionStatusText = isConnected 
    ? 'Connected to Payload Server' 
    : `Payload Server Offline${connectionError ? `: ${connectionError}` : ''}`;

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-brand">
            <Link to="/" className="nav-brand-link">
              <h1>AI Blog Writer</h1>
            </Link>
          </div>

          {/* Connection Status Indicator */}
          <div 
            className={`nav-connection-status ${isConnected ? 'connected' : 'disconnected'}`}
            title={connectionStatusText}
          >
            <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <span className="connection-text">
              {isConnected ? 'Connected to Payload Server' : 'Payload Server Offline'}
            </span>
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
            <span className="nav-user">{user?.email}</span>
            <button type="button" className="nav-logout-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        <div className={`nav-mobile-menu ${isMobileMenuOpen ? 'open' : ''}`} aria-expanded={isMobileMenuOpen}>
          <div className={`nav-mobile-connection ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <span className="connection-text">
              {isConnected ? 'Connected to Payload Server' : 'Payload Server Offline'}
            </span>
          </div>
          {connectionError && !isConnected && (
            <p className="nav-mobile-connection-error">{connectionError}</p>
          )}
          <span className="nav-mobile-user">{user?.email}</span>
          <button type="button" className="nav-mobile-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </nav>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
