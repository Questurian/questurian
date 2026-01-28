import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginModal from '../LoginModal';

interface EnhancedAuthFormProps {
  inModal?: boolean;
  onSuccess?: () => void;
  errorMessage?: string;
  prefillEmail?: string;
  onModeChange?: (isSignUp: boolean, showPasswordStep: boolean) => void;
}

// Mock the EnhancedAuthForm component
jest.mock('@/features/Auth', () => ({
  EnhancedAuthForm: ({ inModal, onSuccess, errorMessage, prefillEmail, onModeChange }: EnhancedAuthFormProps) => (
    <div data-testid="auth-form">
      <div>inModal: {inModal ? 'true' : 'false'}</div>
      <div>errorMessage: {errorMessage || 'none'}</div>
      <div>prefillEmail: {prefillEmail || 'none'}</div>
      <button onClick={() => onSuccess?.()}>Mock Success</button>
      <button onClick={() => onModeChange?.(true, true)}>Mock Mode Change</button>
    </div>
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

describe('LoginModal Component', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Modal Visibility', () => {
    it('should render nothing when isOpen is false', () => {
      const { container } = render(
        <LoginModal isOpen={false} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      expect(container.querySelector('.fixed.inset-0')).not.toBeInTheDocument();
    });

    it('should render modal when isOpen is true', () => {
      const { container } = render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      expect(container.querySelector('.fixed.inset-0')).toBeInTheDocument();
    });

    it('should render modal backdrop overlay', () => {
      const { container } = render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      const overlay = container.querySelector('.fixed.inset-0.bg-black\\/30');
      expect(overlay).toBeInTheDocument();
    });
  });

  describe('Modal Content', () => {
    it('should render default title and subtitle', () => {
      render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    it('should render custom title when provided', () => {
      render(
        <LoginModal
          isOpen={true}
          onClose={jest.fn()}
          title="Custom Title"
        />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('should render custom subtitle when provided', () => {
      render(
        <LoginModal
          isOpen={true}
          onClose={jest.fn()}
          subtitle="Custom Subtitle"
        />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('Custom Subtitle')).toBeInTheDocument();
    });

    it('should render EnhancedAuthForm component', () => {
      render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByTestId('auth-form')).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('should render close button', () => {
      const { container } = render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      const closeBtn = container.querySelector('button');
      expect(closeBtn).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = jest.fn();
      const { container } = render(
        <LoginModal isOpen={true} onClose={onClose} />,
        { wrapper: createWrapper() }
      );
      const closeBtn = container.querySelector('button');
      fireEvent.click(closeBtn!);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop overlay is clicked', () => {
      const onClose = jest.fn();
      const { container } = render(
        <LoginModal isOpen={true} onClose={onClose} />,
        { wrapper: createWrapper() }
      );
      const overlay = container.querySelector('.fixed.inset-0.bg-black\\/30');
      fireEvent.click(overlay!);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Form Props', () => {
    it('should pass inModal=true to EnhancedAuthForm', () => {
      render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('inModal: true')).toBeInTheDocument();
    });

    it('should pass errorMessage prop to EnhancedAuthForm', () => {
      render(
        <LoginModal
          isOpen={true}
          onClose={jest.fn()}
          errorMessage="Test error"
        />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('errorMessage: Test error')).toBeInTheDocument();
    });

    it('should pass prefillEmail prop to EnhancedAuthForm', () => {
      render(
        <LoginModal
          isOpen={true}
          onClose={jest.fn()}
          prefillEmail="test@example.com"
        />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('prefillEmail: test@example.com')).toBeInTheDocument();
    });
  });

  describe('Success Callback', () => {
    it('should call onSuccess and onClose on form success', () => {
      const onClose = jest.fn();
      const onSuccess = jest.fn();
      render(
        <LoginModal
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
        />,
        { wrapper: createWrapper() }
      );
      const successBtn = screen.getByText('Mock Success');
      fireEvent.click(successBtn);
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should call onClose even if onSuccess is not provided', () => {
      const onClose = jest.fn();
      render(
        <LoginModal isOpen={true} onClose={onClose} />,
        { wrapper: createWrapper() }
      );
      const successBtn = screen.getByText('Mock Success');
      fireEvent.click(successBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Mode Changes', () => {
    it('should update title and subtitle on mode change to signup with password', () => {
      render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      const modeBtn = screen.getByText('Mock Mode Change');
      fireEvent.click(modeBtn);
      expect(screen.getByText('Create Your Account')).toBeInTheDocument();
    });

    it('should not change title when custom title is provided', () => {
      render(
        <LoginModal
          isOpen={true}
          onClose={jest.fn()}
          title="Fixed Title"
        />,
        { wrapper: createWrapper() }
      );
      const modeBtn = screen.getByText('Mock Mode Change');
      fireEvent.click(modeBtn);
      expect(screen.getByText('Fixed Title')).toBeInTheDocument();
      expect(screen.queryByText('Create Your Account')).not.toBeInTheDocument();
    });
  });

  describe('Styling and Classes', () => {
    it('should have correct modal styling classes', () => {
      const { container } = render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      const modalContent = container.querySelector('.inline-block.align-bottom.bg-white');
      expect(modalContent).toBeInTheDocument();
    });

    it('should support dark mode classes', () => {
      const { container } = render(
        <LoginModal isOpen={true} onClose={jest.fn()} />,
        { wrapper: createWrapper() }
      );
      const modalContent = container.querySelector('.dark\\:bg-gray-800');
      expect(modalContent).toBeInTheDocument();
    });
  });

  describe('Modal With All Props', () => {
    it('should render with all optional props', () => {
      const onClose = jest.fn();
      const onSuccess = jest.fn();
      render(
        <LoginModal
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
          title="Test Title"
          subtitle="Test Subtitle"
          errorMessage="Test Error"
          prefillEmail="user@example.com"
        />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
      expect(screen.getByText('errorMessage: Test Error')).toBeInTheDocument();
      expect(screen.getByText('prefillEmail: user@example.com')).toBeInTheDocument();
    });
  });
});
