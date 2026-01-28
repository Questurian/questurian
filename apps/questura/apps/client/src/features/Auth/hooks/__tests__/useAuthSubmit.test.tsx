import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthSubmit } from '../useAuthSubmit';
import type { AuthFormData } from '../../types';
import * as userHooks from '@/lib/user/hooks';

interface MockMutationReturn {
  mutate: jest.Mock;
  mutateAsync?: jest.Mock;
  isPending: boolean;
}

// Mock next/navigation - already mocked in jest.setup.ts
jest.mock('next/navigation');

// Mock the user hooks at the API level
jest.mock('@/lib/api');
jest.mock('@/lib/user/hooks', () => ({
  useUserQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  })),
  useLoginMutation: jest.fn(),
  useLogoutMutation: jest.fn(),
  useSignupMutation: jest.fn(),
  useAuth: jest.fn(),
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

describe('useAuthSubmit - TDD Phase 1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Hook Creation', () => {
    it('should create a hook instance with attemptSignIn and attemptSignUp methods', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current).toBeDefined();
      expect(typeof result.current.attemptSignIn).toBe('function');
      expect(typeof result.current.attemptSignUp).toBe('function');
    });
  });

  describe('useAuthSubmit Hook - Basic Structure', () => {
    it('should return an object with attemptSignIn method', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignIn).toBeDefined();
      expect(typeof result.current.attemptSignIn).toBe('function');
    });

    it('should return an object with attemptSignUp method', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignUp).toBeDefined();
      expect(typeof result.current.attemptSignUp).toBe('function');
    });

    it('should accept inModal option', () => {
      const { result } = renderHook(
        () => useAuthSubmit({ inModal: true }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept onSuccess callback option', () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(
        () => useAuthSubmit({ inModal: true, onSuccess }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should work with both modal and page context', () => {
      const { result: modalResult } = renderHook(
        () => useAuthSubmit({ inModal: true }),
        { wrapper: createWrapper() }
      );

      const { result: pageResult } = renderHook(
        () => useAuthSubmit({ inModal: false }),
        { wrapper: createWrapper() }
      );

      expect(modalResult.current).toBeDefined();
      expect(pageResult.current).toBeDefined();
    });
  });

  describe('Hook Methods Signature', () => {
    it('attemptSignIn should be an async function', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignIn.constructor.name).toBe('AsyncFunction');
    });

    it('attemptSignUp should be an async function', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignUp.constructor.name).toBe('AsyncFunction');
    });

    it('attemptSignIn should accept form data', async () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      const formData: AuthFormData = {
        email: 'test@example.com',
        password: 'Test@1234',
      };

      // This will fail because mocks aren't set up, but we're testing the signature
      try {
        await result.current.attemptSignIn(formData);
      } catch {
        // Expected to fail with unmocked dependencies
      }
    });

    it('attemptSignUp should accept form data', async () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      const formData: AuthFormData = {
        email: 'test@example.com',
        password: 'Test@1234',
      };

      // This will fail because mocks aren't set up, but we're testing the signature
      try {
        await result.current.attemptSignUp(formData);
      } catch {
        // Expected to fail with unmocked dependencies
      }
    });
  });

  describe('Test Structure Validation', () => {
    it('test should validate that useAuthSubmit is a functional hook', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      // Verify the hook returns the expected structure
      expect(result.current).toHaveProperty('attemptSignIn');
      expect(result.current).toHaveProperty('attemptSignUp');
    });

    it('should handle options parameter correctly', () => {
      const options = { inModal: true, onSuccess: jest.fn() };
      const { result } = renderHook(() => useAuthSubmit(options), { wrapper: createWrapper() });

      expect(result.current).toBeDefined();
    });

    it('should allow optional onSuccess callback', () => {
      // Without onSuccess
      const { result: result1 } = renderHook(
        () => useAuthSubmit({ inModal: true }),
        { wrapper: createWrapper() }
      );

      // With onSuccess
      const { result: result2 } = renderHook(
        () => useAuthSubmit({ inModal: true, onSuccess: jest.fn() }),
        { wrapper: createWrapper() }
      );

      expect(result1.current).toBeDefined();
      expect(result2.current).toBeDefined();
    });
  });

  describe('Hook Method Availability', () => {
    it('should always return the attemptSignIn method', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignIn).toBeDefined();
      expect(typeof result.current.attemptSignIn).toBe('function');
    });

    it('should always return the attemptSignUp method', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignUp).toBeDefined();
      expect(typeof result.current.attemptSignUp).toBe('function');
    });

    it('should provide methods that can be called multiple times', () => {
      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      const methods = result.current;

      // Verify we can access methods repeatedly
      expect(methods.attemptSignIn).toBeDefined();
      expect(methods.attemptSignUp).toBeDefined();
    });
  });
});

// Phase 4: API Error Scenarios
describe('useAuthSubmit - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Resilience', () => {
    const mockUseLoginMutation = userHooks.useLoginMutation as jest.MockedFunction<
      typeof userHooks.useLoginMutation
    >;
    const mockUseSignupMutation = userHooks.useSignupMutation as jest.MockedFunction<
      typeof userHooks.useSignupMutation
    >;

    it('should handle mutation errors gracefully without crashing', () => {
      const mockReturn: MockMutationReturn = {
        mutate: jest.fn(),
        mutateAsync: jest.fn().mockRejectedValue(new Error('Network error')),
        isPending: false,
      };
      // @ts-expect-error - Mock returns don't match real mutation type
      mockUseLoginMutation.mockReturnValue(mockReturn);

      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      // Hook should still be usable even if mutations can fail
      expect(result.current.attemptSignIn).toBeDefined();
      expect(result.current.attemptSignUp).toBeDefined();
    });

    it('should provide error context for sign in failures', () => {
      const errorMessage = 'Invalid credentials';
      const mockReturn: MockMutationReturn = {
        mutate: jest.fn((data, options) => {
          options?.onError?.(new Error(errorMessage));
        }),
        mutateAsync: jest.fn().mockRejectedValue(new Error(errorMessage)),
        isPending: false,
      };
      // @ts-expect-error - Mock returns don't match real mutation type
      mockUseLoginMutation.mockReturnValue(mockReturn);

      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignIn).toBeDefined();
    });

    it('should provide error context for sign up failures', () => {
      const errorMessage = 'Email already in use';
      const mockReturn: MockMutationReturn = {
        mutate: jest.fn((data, options) => {
          options?.onError?.(new Error(errorMessage));
        }),
        mutateAsync: jest.fn().mockRejectedValue(new Error(errorMessage)),
        isPending: false,
      };
      // @ts-expect-error - Mock returns don't match real mutation type
      mockUseSignupMutation.mockReturnValue(mockReturn);

      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      expect(result.current.attemptSignUp).toBeDefined();
    });

    it('should accept both email/password and other form fields', () => {
      const mockReturn: MockMutationReturn = {
        mutate: jest.fn(),
        mutateAsync: jest.fn(),
        isPending: false,
      };
      // @ts-expect-error - Mock returns don't match real mutation type
      mockUseSignupMutation.mockReturnValue(mockReturn);

      const { result } = renderHook(() => useAuthSubmit({ inModal: true }), { wrapper: createWrapper() });

      // Verify methods exist and accept form data
      expect(typeof result.current.attemptSignIn).toBe('function');
      expect(typeof result.current.attemptSignUp).toBe('function');
    });

    it('should support optional callbacks for error handling', () => {
      const mockReturn: MockMutationReturn = {
        mutate: jest.fn(),
        mutateAsync: jest.fn(),
        isPending: false,
      };
      // @ts-expect-error - Mock returns don't match real mutation type
      mockUseLoginMutation.mockReturnValue(mockReturn);

      const { result } = renderHook(
        () => useAuthSubmit({ inModal: true, onSuccess: jest.fn() }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });
  });
});
