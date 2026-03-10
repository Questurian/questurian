import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useAppShellMenu({ logout }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSettingsDropdownOpen(false);
  }, [location]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (isMobileMenuOpen && !event.target.closest('.navbar')) {
        setIsMobileMenuOpen(false);
      }
      if (isSettingsDropdownOpen && !event.target.closest('.nav-dropdown')) {
        setIsSettingsDropdownOpen(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMobileMenuOpen, isSettingsDropdownOpen]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsSettingsDropdownOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  function toggleMobileMenu() {
    setIsMobileMenuOpen((current) => !current);
  }

  function toggleSettingsDropdown() {
    setIsSettingsDropdownOpen((current) => !current);
  }

  function handleLogout() {
    setIsSettingsDropdownOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  return {
    handleLogout,
    isMobileMenuOpen,
    isSettingsDropdownOpen,
    toggleMobileMenu,
    toggleSettingsDropdown,
  };
}
