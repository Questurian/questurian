import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../useAuth';
import { useUserQuery } from '../useUserQuery';
import type { User } from '../types';

// Mock useUserQuery
jest.mock('../useUserQuery');

const mockUseUserQuery = useUserQuery as jest.MockedFunction<typeof useUserQuery>;

const mockUser: User = {
  id: 123,
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
  authProvider: 'local',
  hasLocalPassword: true,
  hasGoogleOAuth: false,
  oauthId: null,
  passwordSetAt: new Date().toISOString(),
  googleLinkedAt: null,
  membershipStatusSummary: 'Active',
  membershipStatusOverview: 'Active membership',
  subscriptionStatus: 'active',
  subscriptionRenewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  membershipExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancelAtPeriodEnd: false,
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: 'sub_123',
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

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticated user state', () => {
    it('should return authenticated user when user data is available', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should have isAuthenticated true when user exists', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('unauthenticated user state', () => {
    it('should return null user when not authenticated', () => {
      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should return null user when data is undefined', () => {
      mockUseUserQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should have isAuthenticated false when user is null', () => {
      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('loading state', () => {
    it('should return loading true when user data is being fetched', () => {
      mockUseUserQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
    });

    it('should return loading false when data is loaded', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(false);
    });

    it('should return loading false when data is null and not loading', () => {
      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('error state', () => {
    it('should return error when query fails', () => {
      const mockError = new Error('Failed to fetch user');

      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: mockError,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(mockError);
    });

    it('should return isError false when there is no error', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return null error when query fails but error is null', () => {
      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('complete state scenarios', () => {
    it('should return initial loading state', () => {
      mockUseUserQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it('should return loaded authenticated state', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isError).toBe(false);
    });

    it('should return loaded unauthenticated state', () => {
      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it('should return error state', () => {
      const mockError = new Error('Network error');

      mockUseUserQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: mockError,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(mockError);
    });
  });

  describe('user query delegation', () => {
    it('should use useUserQuery hook', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(mockUseUserQuery).toHaveBeenCalled();
    });

    it('should pass through user data from query', () => {
      const testUser: User = {
        id: '456',
        email: 'another@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        membership: {
          status: 'inactive',
          expiresAt: new Date().toISOString(),
        },
      };

      mockUseUserQuery.mockReturnValue({
        data: testUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.user).toEqual(testUser);
    });
  });

  describe('auth state consistency', () => {
    it('should not return authenticated when loading', () => {
      mockUseUserQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.loading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should return authenticated and not error when user is present', () => {
      mockUseUserQuery.mockReturnValue({
        data: mockUser,
        isLoading: false,
        isError: false,
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isError).toBe(false);
    });
  });
});
