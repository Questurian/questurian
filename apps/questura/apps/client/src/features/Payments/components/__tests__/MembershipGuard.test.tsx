import React from 'react';
import { render, screen } from '@testing-library/react';
import MembershipGuard from '../MembershipGuard';
import type { User } from '@/lib/user/types';

describe('MembershipGuard Component', () => {
  const mockActiveMember: User = {
    id: '123',
    email: 'active@example.com',
    firstName: 'Active',
    lastName: 'Member',
    membership: {
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    },
    isPaidMember: true,
    membershipExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockExpiredMember: User = {
    id: '456',
    email: 'expired@example.com',
    firstName: 'Expired',
    lastName: 'Member',
    membership: {
      status: 'inactive',
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    },
    isPaidMember: true,
    membershipExpiration: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockNonMember: User = {
    id: '789',
    email: 'free@example.com',
    firstName: 'Free',
    lastName: 'User',
    membership: {
      status: 'inactive',
      expiresAt: null,
    },
    isPaidMember: false,
    membershipExpiration: null,
  };

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Active Member', () => {
    it('should render children for active member', () => {
      render(
        <MembershipGuard user={mockActiveMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText('Premium Content')).toBeInTheDocument();
    });

    it('should not render default message for active member', () => {
      render(
        <MembershipGuard user={mockActiveMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.queryByText(/You're Already a Member!/i)).not.toBeInTheDocument();
    });

    it('should not render fallback for active member', () => {
      render(
        <MembershipGuard
          user={mockActiveMember}
          fallback={<div>Fallback Content</div>}
        >
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText('Premium Content')).toBeInTheDocument();
      expect(screen.queryByText('Fallback Content')).not.toBeInTheDocument();
    });
  });

  describe('Expired Member', () => {
    it('should render default message for expired member', () => {
      render(
        <MembershipGuard user={mockExpiredMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText(/You're Already a Member!/i)).toBeInTheDocument();
    });

    it('should not render children for expired member', () => {
      render(
        <MembershipGuard user={mockExpiredMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.queryByText('Premium Content')).not.toBeInTheDocument();
    });

    it('should render Go to Account link for expired member', () => {
      render(
        <MembershipGuard user={mockExpiredMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      const link = screen.getByText('Go to Account');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/account');
    });
  });

  describe('Non-Member', () => {
    it('should render default message for non-member', () => {
      render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText(/You're Already a Member!/i)).toBeInTheDocument();
    });

    it('should not render children for non-member', () => {
      render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.queryByText('Premium Content')).not.toBeInTheDocument();
    });

    it('should render fallback content for non-member when provided', () => {
      render(
        <MembershipGuard
          user={mockNonMember}
          fallback={<div>Fallback Content</div>}
        >
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText('Fallback Content')).toBeInTheDocument();
      expect(screen.queryByText('Premium Content')).not.toBeInTheDocument();
    });

    it('should render default message when no fallback provided', () => {
      render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText(/You're Already a Member!/i)).toBeInTheDocument();
    });
  });

  describe('Null User', () => {
    it('should render default message when user is null', () => {
      render(
        <MembershipGuard user={null}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText(/You're Already a Member!/i)).toBeInTheDocument();
    });

    it('should not render children when user is null', () => {
      render(
        <MembershipGuard user={null}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.queryByText('Premium Content')).not.toBeInTheDocument();
    });

    it('should render fallback when user is null and fallback provided', () => {
      render(
        <MembershipGuard
          user={null}
          fallback={<div>Fallback Content</div>}
        >
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText('Fallback Content')).toBeInTheDocument();
    });
  });

  describe('Fallback Content', () => {
    it('should render custom fallback content when user is not active member', () => {
      const fallbackContent = <div data-testid="custom-fallback">Custom Fallback</div>;
      render(
        <MembershipGuard user={mockNonMember} fallback={fallbackContent}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
      expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
    });

    it('should not render fallback when user is active member', () => {
      const fallbackContent = <div data-testid="custom-fallback">Custom Fallback</div>;
      render(
        <MembershipGuard user={mockActiveMember} fallback={fallbackContent}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.queryByTestId('custom-fallback')).not.toBeInTheDocument();
    });

    it('should render complex fallback content', () => {
      const complexFallback = (
        <div data-testid="complex-fallback">
          <h2>Limited Access</h2>
          <p>You need a membership to view this content</p>
          <button>Upgrade Now</button>
        </div>
      );
      render(
        <MembershipGuard user={mockNonMember} fallback={complexFallback}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByTestId('complex-fallback')).toBeInTheDocument();
      expect(screen.getByText('Limited Access')).toBeInTheDocument();
      expect(screen.getByText('Upgrade Now')).toBeInTheDocument();
    });
  });

  describe('Default Message Content', () => {
    it('should show correct heading text', () => {
      render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText(/You're Already a Member!/i)).toBeInTheDocument();
    });

    it('should show descriptive text in default message', () => {
      render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(
        screen.getByText(/You already have an active membership/i)
      ).toBeInTheDocument();
    });

    it('should include account management link in default message', () => {
      render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      const accountLink = screen.getByText('Go to Account');
      expect(accountLink).toBeInTheDocument();
      expect(accountLink).toHaveAttribute('href', '/account');
    });

    it('should have correct styling for default message', () => {
      const { container } = render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      const messageContainer = container.querySelector('.max-w-2xl');
      expect(messageContainer).toBeInTheDocument();
      expect(messageContainer).toHaveClass('mx-auto');
      expect(messageContainer).toHaveClass('px-4');
    });
  });

  describe('Component Rendering', () => {
    it('should render without errors', () => {
      const { container } = render(
        <MembershipGuard user={mockActiveMember}>
          <div>Content</div>
        </MembershipGuard>
      );
      expect(container).toBeInTheDocument();
    });

    it('should handle different content types in children', () => {
      render(
        <MembershipGuard user={mockActiveMember}>
          <article>
            <h1>Article Title</h1>
            <p>Article content</p>
          </article>
        </MembershipGuard>
      );
      expect(screen.getByText('Article Title')).toBeInTheDocument();
      expect(screen.getByText('Article content')).toBeInTheDocument();
    });

    it('should handle multiple children elements', () => {
      render(
        <MembershipGuard user={mockActiveMember}>
          <div>Content 1</div>
          <div>Content 2</div>
          <div>Content 3</div>
        </MembershipGuard>
      );
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
      expect(screen.getByText('Content 3')).toBeInTheDocument();
    });
  });

  describe('Membership Status Edge Cases', () => {
    it('should handle membership with no expiration date', () => {
      const userWithoutExpiration = {
        ...mockActiveMember,
        membershipExpiration: null,
      };
      render(
        <MembershipGuard user={userWithoutExpiration}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText(/You're Already a Member!/i)).toBeInTheDocument();
    });

    it('should handle membership expiring today', () => {
      const expiringToday = {
        ...mockActiveMember,
        membershipExpiration: new Date().toISOString(),
      };
      render(
        <MembershipGuard user={expiringToday}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      // Should not show content if membership has expired or is expiring
      // Depends on implementation of isActiveMember function
      const content = screen.queryByText('Premium Content');
      expect(content).not.toBeInTheDocument();
    });

    it('should handle membership expiring tomorrow', () => {
      const expiringTomorrow = {
        ...mockActiveMember,
        membershipExpiration: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      render(
        <MembershipGuard user={expiringTomorrow}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      expect(screen.getByText('Premium Content')).toBeInTheDocument();
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode classes in default message', () => {
      const { container } = render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      const bgElement = container.querySelector('.dark\\:bg-gray-800');
      expect(bgElement).toBeInTheDocument();
    });

    it('should have dark mode text classes', () => {
      const { container } = render(
        <MembershipGuard user={mockNonMember}>
          <div>Premium Content</div>
        </MembershipGuard>
      );
      const darkTextElement = container.querySelector('.dark\\:text-white');
      expect(darkTextElement).toBeInTheDocument();
    });
  });
});
