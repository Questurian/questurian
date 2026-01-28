import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MembershipSection } from './MembershipSection';
import { mockUsers } from '../../../../../__mocks__/data';

interface CancelSubscriptionModalProps {
  show?: boolean;
  onConfirm?: () => void;
  onClose?: () => void;
}

// Mock the subscription mutations
jest.mock('../../../Payments/hooks/useSubscriptionMutations', () => ({
  useCancelSubscriptionMutation: jest.fn(),
  useRenewSubscriptionMutation: jest.fn(),
  useCreatePortalSessionMutation: jest.fn(),
}));

// Mock the CancelSubscriptionModal
jest.mock('../../../Payments/components/CancelSubscriptionModal', () => {
  return {
    CancelSubscriptionModal: ({ show, onConfirm, onClose }: CancelSubscriptionModalProps) => {
      if (!show) return null;
      return (
        <div data-testid="cancel-modal">
          <button onClick={onConfirm} data-testid="confirm-cancel">
            Confirm Cancel
          </button>
          <button onClick={onClose} data-testid="close-modal">
            Close
          </button>
        </div>
      );
    },
  };
});

// Import the mocked hooks after mocking the module
import {
  useCancelSubscriptionMutation,
  useRenewSubscriptionMutation,
  useCreatePortalSessionMutation,
} from '../../../Payments/hooks/useSubscriptionMutations';

describe('MembershipSection', () => {
  const mockCancelMutation = {
    mutate: jest.fn(),
    isPending: false,
    error: null,
  };

  const mockRenewMutation = {
    mutate: jest.fn(),
    isPending: false,
    error: null,
  };

  const mockPortalMutation = {
    mutate: jest.fn(),
    isPending: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useCancelSubscriptionMutation as jest.Mock).mockReturnValue(mockCancelMutation);
    (useRenewSubscriptionMutation as jest.Mock).mockReturnValue(mockRenewMutation);
    (useCreatePortalSessionMutation as jest.Mock).mockReturnValue(mockPortalMutation);
  });

  describe('Inactive Member State', () => {
    it('renders correct badge for inactive member', () => {
      render(<MembershipSection user={mockUsers.inactiveMember} />);

      const badge = screen.getByText('Inactive Member');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-gray-100');
    });

    it('shows upgrade button for inactive member', () => {
      render(<MembershipSection user={mockUsers.inactiveMember} />);

      const upgradeButton = screen.getByRole('link', { name: /upgrade/i });
      expect(upgradeButton).toBeInTheDocument();
      expect(upgradeButton).toHaveAttribute('href', '/purchase/monthly');
    });

    it('does not show cancel or reactivate buttons for inactive member', () => {
      render(<MembershipSection user={mockUsers.inactiveMember} />);

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reactivate/i })).not.toBeInTheDocument();
    });

    it('does not show billing info for inactive member', () => {
      render(<MembershipSection user={mockUsers.inactiveMember} />);

      expect(screen.queryByText('Billing Information')).not.toBeInTheDocument();
    });
  });

  describe('Active Member State', () => {
    it('renders correct badge for active member', () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const badge = screen.getByText('Premium Member');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('from-yellow-400');
    });

    it('shows cancel button for active member', () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it('does not show upgrade button for active member', () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      expect(screen.queryByRole('link', { name: /upgrade/i })).not.toBeInTheDocument();
    });

    it('shows billing information for active member', () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      expect(screen.getByText('Billing Information')).toBeInTheDocument();
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText(/Next Payment:/)).toBeInTheDocument();
    });

    it('shows update payment method button for active member', () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const paymentButton = screen.getByRole('button', { name: /update payment method/i });
      expect(paymentButton).toBeInTheDocument();
    });
  });

  describe('Expiring Member State', () => {
    it('renders correct badge for expiring member', () => {
      render(<MembershipSection user={mockUsers.expiringMember} />);

      const badge = screen.getByText('Premium - Expiring');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-yellow-100');
    });

    it('shows reactivate button for expiring member', () => {
      render(<MembershipSection user={mockUsers.expiringMember} />);

      const reactivateButton = screen.getByRole('button', { name: /reactivate/i });
      expect(reactivateButton).toBeInTheDocument();
    });

    it('does not show cancel button for expiring member', () => {
      render(<MembershipSection user={mockUsers.expiringMember} />);

      expect(screen.queryByRole('button', { name: /cancel subscription/i })).not.toBeInTheDocument();
    });
  });

  describe('Cancelled Member State', () => {
    it('renders correct badge for cancelled member not yet expired', () => {
      render(<MembershipSection user={mockUsers.cancelledMember} />);

      const badge = screen.getByText('Membership Cancelled');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-orange-100');
    });

    it('shows reactivate button for cancelled member not yet expired', () => {
      render(<MembershipSection user={mockUsers.cancelledMember} />);

      const reactivateButton = screen.getByRole('button', { name: /reactivate/i });
      expect(reactivateButton).toBeInTheDocument();
    });

    it('renders expired badge for expired cancelled member', () => {
      render(<MembershipSection user={mockUsers.expiredMember} />);

      const badge = screen.getByText('Membership Expired');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-red-100');
    });

    it('shows upgrade button for expired member', () => {
      render(<MembershipSection user={mockUsers.expiredMember} />);

      const upgradeButton = screen.getByRole('link', { name: /upgrade/i });
      expect(upgradeButton).toBeInTheDocument();
    });
  });

  describe('Cancel Subscription Flow', () => {
    it('opens cancellation modal when cancel button clicked', async () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-modal')).toBeInTheDocument();
      });
    });

    it('calls cancel mutation when confirmed', async () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
      fireEvent.click(cancelButton);

      const confirmButton = await screen.findByTestId('confirm-cancel');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockCancelMutation.mutate).toHaveBeenCalled();
      });
    });

    it('shows loading state while cancelling', async () => {
      const loadingMutation = {
        mutate: jest.fn(),
        isPending: true,
        error: null,
      };
      (useCancelSubscriptionMutation as jest.Mock).mockReturnValue(loadingMutation);

      render(<MembershipSection user={mockUsers.activeMember} />);

      const cancelButton = screen.getByRole('button', { name: /cancelling/i });
      expect(cancelButton).toBeDisabled();
    });

    it('shows success message after successful cancellation', async () => {
      const successMutation = {
        mutate: jest.fn((_, options) => {
          options.onSuccess({ message: 'Subscription cancelled successfully' });
        }),
        isPending: false,
        error: null,
      };
      (useCancelSubscriptionMutation as jest.Mock).mockReturnValue(successMutation);

      render(<MembershipSection user={mockUsers.activeMember} />);

      const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
      fireEvent.click(cancelButton);

      const confirmButton = await screen.findByTestId('confirm-cancel');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Subscription cancelled successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Reactivate Subscription Flow', () => {
    it('calls renew mutation when reactivate clicked', async () => {
      render(<MembershipSection user={mockUsers.cancelledMember} />);

      const reactivateButton = screen.getByRole('button', { name: /reactivate/i });
      fireEvent.click(reactivateButton);

      await waitFor(() => {
        expect(mockRenewMutation.mutate).toHaveBeenCalled();
      });
    });

    it('shows loading state while reactivating', async () => {
      const loadingMutation = {
        mutate: jest.fn(),
        isPending: true,
        error: null,
      };
      (useRenewSubscriptionMutation as jest.Mock).mockReturnValue(loadingMutation);

      render(<MembershipSection user={mockUsers.cancelledMember} />);

      const reactivateButton = screen.getByRole('button', { name: /reactivating/i });
      expect(reactivateButton).toBeDisabled();
    });

    it('shows success message after successful reactivation', async () => {
      const successMutation = {
        mutate: jest.fn((_, options) => {
          options.onSuccess({ message: 'Subscription reactivated successfully' });
        }),
        isPending: false,
        error: null,
      };
      (useRenewSubscriptionMutation as jest.Mock).mockReturnValue(successMutation);

      render(<MembershipSection user={mockUsers.cancelledMember} />);

      const reactivateButton = screen.getByRole('button', { name: /reactivate/i });
      fireEvent.click(reactivateButton);

      await waitFor(() => {
        expect(screen.getByText('Subscription reactivated successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Payment Method Management', () => {
    it('shows update payment method button for active subscriptions', () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const paymentButton = screen.getByRole('button', { name: /update payment method/i });
      expect(paymentButton).toBeInTheDocument();
    });

    it('calls portal session mutation when update payment clicked', async () => {
      render(<MembershipSection user={mockUsers.activeMember} />);

      const paymentButton = screen.getByRole('button', { name: /update payment method/i });
      fireEvent.click(paymentButton);

      await waitFor(() => {
        expect(mockPortalMutation.mutate).toHaveBeenCalled();
      });
    });

    it('does not show update payment method for cancelled subscriptions', () => {
      render(<MembershipSection user={mockUsers.expiredMember} />);

      expect(screen.queryByRole('button', { name: /update payment method/i })).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when cancellation fails', () => {
      const errorMutation = {
        mutate: jest.fn(),
        isPending: false,
        error: { message: 'Unable to cancel subscription' },
      };
      (useCancelSubscriptionMutation as jest.Mock).mockReturnValue(errorMutation);

      render(<MembershipSection user={mockUsers.activeMember} />);

      expect(screen.getByText('Unable to cancel subscription')).toBeInTheDocument();
    });

    it('displays error message when renewal fails', () => {
      const errorMutation = {
        mutate: jest.fn(),
        isPending: false,
        error: { message: 'Unable to reactivate subscription' },
      };
      (useRenewSubscriptionMutation as jest.Mock).mockReturnValue(errorMutation);

      render(<MembershipSection user={mockUsers.cancelledMember} />);

      expect(screen.getByText('Unable to reactivate subscription')).toBeInTheDocument();
    });

    it('allows user to dismiss success message', async () => {
      const successMutation = {
        mutate: jest.fn((_, options) => {
          options.onSuccess({ message: 'Success!' });
        }),
        isPending: false,
        error: null,
      };
      (useCancelSubscriptionMutation as jest.Mock).mockReturnValue(successMutation);

      render(<MembershipSection user={mockUsers.activeMember} />);

      const cancelButton = screen.getByRole('button', { name: /cancel subscription/i });
      fireEvent.click(cancelButton);

      const confirmButton = await screen.findByTestId('confirm-cancel');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Success!')).toBeInTheDocument();
      });

      // Find and click the close button (the SVG icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find((btn) =>
        btn.querySelector('svg')
      );

      if (closeButton) {
        fireEvent.click(closeButton);
        expect(screen.queryByText('Success!')).not.toBeInTheDocument();
      }
    });
  });

  describe('Null User Handling', () => {
    it('renders free member state when user is null', () => {
      render(<MembershipSection user={null} />);

      const badge = screen.getByText('Free Member');
      expect(badge).toBeInTheDocument();
    });

    it('shows upgrade button when user is null', () => {
      render(<MembershipSection user={null} />);

      const upgradeButton = screen.getByRole('link', { name: /upgrade/i });
      expect(upgradeButton).toBeInTheDocument();
    });
  });

  describe('Data Updates After Login', () => {
    it('updates membership info when user data changes (like after login)', async () => {
      // Start with inactive user (logged out state)
      const { rerender } = render(<MembershipSection user={mockUsers.inactiveMember} />);

      // Verify no billing info showing initially
      expect(screen.queryByText('Billing Information')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /cancel subscription/i })).not.toBeInTheDocument();

      // Simulate user logging in - user data updates
      rerender(<MembershipSection user={mockUsers.activeMember} />);

      // Expected: Billing info should NOW appear (without page refresh)
      // This tests the bug: currently fails because data doesn't refresh after login
      await waitFor(() => {
        expect(screen.getByText('Billing Information')).toBeInTheDocument();
      });
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel subscription/i })).toBeInTheDocument();
    });

    it('updates badge when user subscription status changes', () => {
      const { rerender } = render(<MembershipSection user={mockUsers.inactiveMember} />);

      // Start with inactive badge
      expect(screen.getByText('Inactive Member')).toBeInTheDocument();

      // User upgrades to active
      rerender(<MembershipSection user={mockUsers.activeMember} />);

      // Badge should update immediately
      expect(screen.queryByText('Inactive Member')).not.toBeInTheDocument();
      expect(screen.getByText('Premium Member')).toBeInTheDocument();
    });
  });
});
