import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Navbar from '../Navbar';
import * as userHooks from '@/lib/user/hooks';
import type { User } from '@/lib/user/types';

// Type definitions for test mocks
interface MockLinkProps {
  children: React.ReactNode;
  href: string;
}

interface LoginModalState {
  isOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  options: Record<string, unknown>;
}

// Mock dependencies
jest.mock('@/lib/user/hooks');
jest.mock('next/link', () => {
  return function MockLink({ children, href }: MockLinkProps) {
    return <a href={href}>{children}</a>;
  };
});

// Mock loginModalStore with proper selector support
const mockOpenLoginModal = jest.fn();
jest.mock('@/lib/stores/loginModalStore', () => ({
  useLoginModalStore: jest.fn(<T = LoginModalState>(selector?: (state: LoginModalState) => T) => {
    const state: LoginModalState = {
      openLoginModal: mockOpenLoginModal,
      closeLoginModal: jest.fn(),
      isOpen: false,
      options: {},
    };
    if (selector) {
      return selector(state);
    }
    return state as T;
  }),
}));

const mockUseAuth = userHooks.useAuth as jest.MockedFunction<typeof userHooks.useAuth>;
const mockUseLogoutMutation = userHooks.useLogoutMutation as jest.MockedFunction<
  typeof userHooks.useLogoutMutation
>;

const mockUser: User = {
  id: 123,
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
  authProvider: 'local',
  hasLocalPassword: true,
  hasGoogleOAuth: false,
  oauthId: null,
  passwordSetAt: new Date().toISOString(),
  googleLinkedAt: null,
  membershipStatusSummary: 'Inactive',
  membershipStatusOverview: 'No active membership',
  subscriptionStatus: 'inactive',
  subscriptionRenewsAt: null,
  membershipExpiration: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  lastLogin: new Date().toISOString(),
  lastLoginMethod: 'local',
  publicProfile: {
    avatar: null,
    isPublic: false,
    displayName: null,
    bio: null,
    expertise: [],
    socialLinks: {
      instagram: null,
      twitter: null,
      website: null,
    },
  },
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const mockMemberUser: User = {
  ...mockUser,
  subscriptionStatus: 'active',
  membershipStatusSummary: 'Active',
  membershipExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

describe('Navbar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Before Hydration', () => {
    it('should always render Home link', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });
      const homeLink = screen.getByText('Home');
      expect(homeLink).toBeInTheDocument();
    });
  });

  describe('Unauthenticated User', () => {
    it('should show Sign In button when user is not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Sign In')).toBeInTheDocument();
      });
    });

    it('should open login modal when Sign In button is clicked', async () => {
      mockOpenLoginModal.mockClear();
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        const signInBtn = screen.getByText('Sign In');
        expect(signInBtn).toBeInTheDocument();
        fireEvent.click(signInBtn);
        expect(mockOpenLoginModal).toHaveBeenCalled();
      });
    });

    it('should show Join Membership link when user is not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Join Membership')).toBeInTheDocument();
      });
    });
  });

  describe('Authenticated User - No Active Membership', () => {
    it('should show user email and Sign Out button when authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('john')).toBeInTheDocument();
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });
    });

    it('should show Join Membership link for non-member authenticated user', async () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Join Membership')).toBeInTheDocument();
      });
    });

    it('should call logout mutation when Sign Out is clicked', async () => {
      const mockLogout = jest.fn();
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: mockLogout,
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        const signOutBtn = screen.getByText('Sign Out');
        fireEvent.click(signOutBtn);
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('Authenticated User - With Active Membership', () => {
    it('should not show Join Membership link for active member', async () => {
      mockUseAuth.mockReturnValue({
        user: mockMemberUser,
        isAuthenticated: true,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByText('Join Membership')).not.toBeInTheDocument();
      });
    });

    it('should show user email and Sign Out button for active member', async () => {
      mockUseAuth.mockReturnValue({
        user: mockMemberUser,
        isAuthenticated: true,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('john')).toBeInTheDocument();
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show Loading indicator while fetching auth state', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      // Should show a loading spinner instead of hiding UI
      await waitFor(() => {
        const navbar = screen.getByRole('navigation');
        const spinner = navbar.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });
    });

    it('should not show Sign In button while loading', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      // Sign In button should not be visible during loading
      expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    });

    it('should not show Join Membership while loading', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      // Join Membership should not be visible during loading
      expect(screen.queryByText('Join Membership')).not.toBeInTheDocument();
    });

    it('should transition from loading to Sign In button', async () => {
      const { rerender } = render(
        <div>
          <Navbar />
        </div>,
        { wrapper: createWrapper() }
      );

      // Initially loading
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      rerender(
        <div>
          <Navbar />
        </div>
      );

      await waitFor(() => {
        const navbar = screen.getByRole('navigation');
        const spinner = navbar.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });

      // Now loading completes
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      rerender(
        <div>
          <Navbar />
        </div>
      );

      await waitFor(() => {
        const navbar = screen.getByRole('navigation');
        const spinner = navbar.querySelector('.animate-spin');
        expect(spinner).not.toBeInTheDocument();
        expect(screen.getByText('Sign In')).toBeInTheDocument();
      });
    });

    it('should show loading indicator during server recovery scenario', async () => {
      // Simulates: page loaded -> server was down -> user sees loading
      // -> server comes back -> loading completes -> sees auth UI
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: true,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      // Should show a small loading spinner, not blank space
      const navbar = screen.getByRole('navigation');
      const spinner = navbar.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      // Spinner should have small size classes
      expect(spinner).toHaveClass('h-4', 'w-4');
    });
  });

  describe('Navbar Structure', () => {
    it('should always render Home link', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('should have correct navbar styling', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      const { container } = render(<Navbar />, { wrapper: createWrapper() });
      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('bg-white');
      expect(nav).toHaveClass('shadow-sm');
    });
  });

  describe('Email Display', () => {
    it('should extract and display username from email', async () => {
      const userWithEmail = {
        ...mockUser,
        email: 'alice.smith@example.com',
      };

      mockUseAuth.mockReturnValue({
        user: userWithEmail,
        isAuthenticated: true,
        loading: false,
        isError: false,
        error: null,
      });

      mockUseLogoutMutation.mockReturnValue({
        mutate: jest.fn(),
      });

      render(<Navbar />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('alice.smith')).toBeInTheDocument();
      });
    });
  });
});
