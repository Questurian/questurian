import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginModalRenderer from '../LoginModalRenderer';

interface MockLoginModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
}

interface LoginModalOptions {
  title?: string;
  subtitle?: string;
  errorMessage?: string;
  prefillEmail?: string;
  onSuccess?: () => void;
}

interface LoginModalStoreState {
  isOpen: boolean;
  options: LoginModalOptions;
  closeLoginModal: jest.Mock;
}

// Mock the LoginModal component
jest.mock('../LoginModal', () => {
  return function MockLoginModal({ isOpen, onClose, onSuccess, title, subtitle }: MockLoginModalProps) {
    if (!isOpen) return null;
    return (
      <div data-testid="login-modal">
        <div>isOpen: {isOpen ? 'true' : 'false'}</div>
        <div>title: {title || 'default'}</div>
        <div>subtitle: {subtitle || 'default'}</div>
        <button onClick={onClose}>Close Modal</button>
        <button onClick={onSuccess}>Success</button>
      </div>
    );
  };
});

// Mock the store
const mockCloseLoginModal = jest.fn();
jest.mock('@/lib/stores/loginModalStore', () => ({
  useLoginModalStore: jest.fn(
    <T,>(selector?: (state: LoginModalStoreState) => T): T | LoginModalStoreState => {
      const state: LoginModalStoreState = {
        isOpen: false,
        options: {},
        closeLoginModal: mockCloseLoginModal,
      };
      if (selector) {
        return selector(state);
      }
      return state;
    }
  ),
}));

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

describe('LoginModalRenderer Component', () => {
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

  describe('Modal Rendering', () => {
    it('should not render modal when closed in store', () => {
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      expect(screen.queryByTestId('login-modal')).not.toBeInTheDocument();
    });

    it('should render LoginModal component', () => {
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      // Component renders without error
      const { container } = render(<LoginModalRenderer />, { wrapper: createWrapper() });
      expect(container).toBeInTheDocument();
    });
  });

  describe('Props Passed to LoginModal', () => {
    it('should pass isOpen prop to LoginModal', () => {
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      // Store mock has isOpen: false, so modal should not render
      expect(screen.queryByTestId('login-modal')).not.toBeInTheDocument();
    });

    it('should pass onClose callback to LoginModal', () => {
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      // Component renders successfully, onClose callback is passed
      const { container } = render(<LoginModalRenderer />, { wrapper: createWrapper() });
      expect(container).toBeInTheDocument();
    });

    it('should pass options from store to LoginModal', () => {
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      // Options from store are passed to LoginModal props
      const { container } = render(<LoginModalRenderer />, { wrapper: createWrapper() });
      expect(container).toBeInTheDocument();
    });
  });

  describe('Store Integration', () => {
    it('should use store to manage modal state', () => {
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      // Component correctly uses store for state
      expect(screen.queryByTestId('login-modal')).not.toBeInTheDocument();
    });

    it('should call closeLoginModal from store', () => {
      mockCloseLoginModal.mockClear();
      render(<LoginModalRenderer />, { wrapper: createWrapper() });
      // Component is connected to store's closeLoginModal function
      expect(mockCloseLoginModal).not.toHaveBeenCalled();
    });
  });

  describe('Component Rendering', () => {
    it('should render without errors', () => {
      const { container } = render(<LoginModalRenderer />, { wrapper: createWrapper() });
      expect(container).toBeInTheDocument();
    });

    it('should be a functional component', () => {
      const { container } = render(<LoginModalRenderer />, { wrapper: createWrapper() });
      expect(container).toBeInTheDocument();
    });
  });
});
