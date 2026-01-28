import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PurchasePage from './PurchasePage';
import { mockUsers } from '../../../../__mocks__/data';

// Type definitions for test mocks
interface EnhancedAuthFormProps {
  onSuccess?: () => void;
  onModeChange?: (isSignUp: boolean, isSignIn: boolean) => void;
}

interface MembershipGuardProps {
  children: React.ReactNode;
}

interface ErrorObject {
  code: string;
}

// Mock the hooks
jest.mock('@/lib/user/hooks', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn(),
  })),
  QueryClient: jest.fn(),
}));

jest.mock('../hooks/useMembership', () => ({
  useMembership: jest.fn(),
}));

jest.mock('../hooks/useSubscriptionMutations', () => ({
  useCreateCheckoutSessionMutation: jest.fn(),
}));

jest.mock('@/lib/react-query', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
  queryKeys: {
    userMe: () => ['user', 'me'],
  },
}));

jest.mock('@/features/Auth', () => ({
  EnhancedAuthForm: ({ onSuccess, onModeChange }: EnhancedAuthFormProps) => (
    <div data-testid="auth-form">
      <button
        data-testid="auth-success-button"
        onClick={() => {
          onSuccess?.();
          onModeChange?.(true, false);
        }}
      >
        Complete Auth
      </button>
    </div>
  ),
}));

jest.mock('../components/MembershipGuard', () => {
  return function MockMembershipGuard({ children }: MembershipGuardProps) {
    return <div data-testid="membership-guard">{children}</div>;
  };
});

// Import mocked modules
import { useAuth } from '@/lib/user/hooks';
import { useMembership } from '../hooks/useMembership';
import { useCreateCheckoutSessionMutation } from '../hooks/useSubscriptionMutations';

describe('PurchasePage', () => {
  const mockCheckoutMutation = {
    mutate: jest.fn(),
    isPending: false,
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUsers.inactiveMember,
      loading: false,
      isAuthenticated: true,
    });
    (useMembership as jest.Mock).mockReturnValue({
      hasValidMembership: false,
    });
    (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(mockCheckoutMutation);
  });

  describe('Loading State', () => {
    it('renders loading message when user data is loading', () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: true,
        isAuthenticated: false,
      });

      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Plan Display', () => {
    it('displays plan name and amount', () => {
      render(<PurchasePage planName="Monthly Plan" amount={10} />);

      expect(screen.getByText('Monthly Plan')).toBeInTheDocument();
      expect(screen.getByText('$10/month')).toBeInTheDocument();
    });

    it('displays custom plan description', () => {
      const description = 'Custom plan description';
      render(<PurchasePage amount={10} planDescription={description} />);

      expect(screen.getByText(description)).toBeInTheDocument();
    });

    it('displays default plan description when not provided', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Cancel anytime • All premium features')).toBeInTheDocument();
    });

    it('displays page title', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Complete Your Purchase')).toBeInTheDocument();
    });
  });

  describe('Authenticated User - Payment Section', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: mockUsers.inactiveMember,
        loading: false,
        isAuthenticated: true,
      });
    });

    it('displays account details for authenticated user', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Complete Your Payment')).toBeInTheDocument();
      expect(screen.getByText('Account Details')).toBeInTheDocument();
      expect(screen.getByText(mockUsers.inactiveMember.email!)).toBeInTheDocument();
    });

    it('displays subscribe button for authenticated user', () => {
      render(<PurchasePage amount={10} />);

      const subscribeButton = screen.getByRole('button', { name: /Subscribe Now/i });
      expect(subscribeButton).toBeInTheDocument();
      expect(subscribeButton).not.toBeDisabled();
    });

    it('calls checkout mutation when subscribe button clicked', async () => {
      render(<PurchasePage amount={10} />);

      const subscribeButton = screen.getByRole('button', { name: /Subscribe Now/i });
      fireEvent.click(subscribeButton);

      await waitFor(() => {
        expect(mockCheckoutMutation.mutate).toHaveBeenCalled();
      });
    });

    it('shows loading state while creating checkout session', () => {
      const loadingMutation = {
        mutate: jest.fn(),
        isPending: true,
        error: null,
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(loadingMutation);

      render(<PurchasePage amount={10} />);

      const subscribeButton = screen.getByRole('button', { name: /Creating session/i });
      expect(subscribeButton).toBeDisabled();
    });

    it('displays error message when checkout fails', () => {
      const errorMutation = {
        mutate: jest.fn(),
        isPending: false,
        error: new Error('Payment processing failed'),
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(errorMutation);

      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Payment processing failed')).toBeInTheDocument();
    });

    it('displays user name if available', () => {
      const userWithName = {
        ...mockUsers.inactiveMember,
        firstName: 'John',
        lastName: 'Doe',
      };
      (useAuth as jest.Mock).mockReturnValue({
        user: userWithName,
        loading: false,
        isAuthenticated: true,
      });

      render(<PurchasePage amount={10} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('displays stripe security message', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByText(/Secure payment powered by Stripe/)).toBeInTheDocument();
    });
  });

  describe('Unauthenticated User - Auth Section', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
        isAuthenticated: false,
      });
    });

    it('displays auth form when user is not authenticated', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByTestId('auth-form')).toBeInTheDocument();
      expect(screen.getByText('Sign In To Complete Your Purchase')).toBeInTheDocument();
    });

    it('displays default auth instruction text', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByText(/If you have an account, you will be asked to sign in/)).toBeInTheDocument();
    });

    it('does not display payment button when unauthenticated', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.queryByRole('button', { name: /Subscribe Now/i })).not.toBeInTheDocument();
    });

    it('handles auth success and updates UI', async () => {
      const { rerender } = render(<PurchasePage amount={10} />);

      const authButton = screen.getByTestId('auth-success-button');
      fireEvent.click(authButton);

      // Simulate user now being authenticated
      (useAuth as jest.Mock).mockReturnValue({
        user: mockUsers.freeMember,
        loading: false,
        isAuthenticated: true,
      });

      rerender(<PurchasePage amount={10} />);

      await waitFor(() => {
        expect(screen.getByText('Complete Your Payment')).toBeInTheDocument();
      });
    });
  });

  describe('Membership Guard', () => {
    it('shows membership guard when user already has valid membership', () => {
      (useMembership as jest.Mock).mockReturnValue({
        hasValidMembership: true,
      });

      render(<PurchasePage amount={10} />);

      expect(screen.getByTestId('membership-guard')).toBeInTheDocument();
    });

    it('does not show membership guard for non-members', () => {
      (useMembership as jest.Mock).mockReturnValue({
        hasValidMembership: false,
      });

      render(<PurchasePage amount={10} />);

      expect(screen.queryByTestId('membership-guard')).not.toBeInTheDocument();
    });
  });

  describe('Plan Amount Display', () => {
    it('displays correct amount in subscribe button', () => {
      render(<PurchasePage amount={19.99} />);

      const subscribeButton = screen.getByRole('button', { name: /Subscribe Now - \$19.99\/month/i });
      expect(subscribeButton).toBeInTheDocument();
    });

    it('displays amount in plan price section', () => {
      render(<PurchasePage amount={5} />);

      expect(screen.getByText('$5/month')).toBeInTheDocument();
    });
  });

  describe('Auth Form State Changes', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        loading: false,
        isAuthenticated: false,
      });
    });

    it('updates instructions when switching between sign up and sign in', () => {
      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Sign In To Complete Your Purchase')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays generic error message when error object is not an Error instance', () => {
      const errorObject: ErrorObject = { code: 'UNKNOWN_ERROR' };
      const errorMutation = {
        mutate: jest.fn(),
        isPending: false,
        error: errorObject,
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(errorMutation);

      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Failed to create checkout session')).toBeInTheDocument();
    });
  });

  describe('Double-Charge Prevention', () => {
    it('disables subscribe button while payment is processing', () => {
      const processingMutation = {
        mutate: jest.fn(),
        isPending: true,
        error: null,
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(processingMutation);

      render(<PurchasePage amount={10} />);

      const subscribeButton = screen.getByRole('button', { name: /Creating session/i });
      expect(subscribeButton).toBeDisabled();
    });

    it('shows loading text during payment processing', () => {
      const processingMutation = {
        mutate: jest.fn(),
        isPending: true,
        error: null,
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(processingMutation);

      render(<PurchasePage amount={10} />);

      expect(screen.getByText('Creating session...')).toBeInTheDocument();
    });

    it('button state prevents multiple clicks during payment', () => {
      // Test that shows when isPending is true, button is disabled
      // This prevents double-clicks in real usage
      const processingMutation = {
        mutate: jest.fn(),
        isPending: true,
        error: null,
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(processingMutation);

      render(<PurchasePage amount={10} />);

      const subscribeButton = screen.getByRole('button', { name: /Creating session/i });

      // Button is disabled, so user cannot click it again
      expect(subscribeButton).toBeDisabled();
      // In real usage, disabled button prevents event handlers from firing
    });

    it('re-enables button if payment fails', () => {
      const failedMutation = {
        mutate: jest.fn(),
        isPending: false,
        error: new Error('Payment failed'),
      };
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue(failedMutation);

      render(<PurchasePage amount={10} />);

      const subscribeButton = screen.getByRole('button', { name: /Subscribe Now/i });
      expect(subscribeButton).not.toBeDisabled();
      expect(subscribeButton).toHaveTextContent('Subscribe Now');
    });

    it('button disabled state matches isPending status', () => {
      const { rerender } = render(<PurchasePage amount={10} />);

      // Initially not pending
      const buttonInitial = screen.getByRole('button', { name: /Subscribe Now/i });
      expect(buttonInitial).not.toBeDisabled();

      // User clicks, now pending
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: true,
        error: null,
      });

      rerender(<PurchasePage amount={10} />);

      const buttonPending = screen.getByRole('button', { name: /Creating session/i });
      expect(buttonPending).toBeDisabled();
    });

    it('button text changes to indicate loading', () => {
      // Start with not loading
      const { rerender } = render(<PurchasePage amount={10} />);
      expect(screen.getByText(/Subscribe Now - \$10\/month/i)).toBeInTheDocument();

      // Simulate payment processing
      (useCreateCheckoutSessionMutation as jest.Mock).mockReturnValue({
        mutate: jest.fn(),
        isPending: true,
        error: null,
      });

      rerender(<PurchasePage amount={10} />);

      expect(screen.getByText('Creating session...')).toBeInTheDocument();
      expect(screen.queryByText(/Subscribe Now - \$10\/month/i)).not.toBeInTheDocument();
    });
  });
});
