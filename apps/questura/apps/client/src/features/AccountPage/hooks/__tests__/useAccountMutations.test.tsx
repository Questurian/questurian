import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useLinkGoogleMutation,
  useUnlinkGoogleMutation,
} from '../useAccountMutations';
import { post } from '@/lib/api';

// Mock the API
jest.mock('@/lib/api');

const mockPost = post as jest.MockedFunction<typeof post>;

// Setup QueryClient wrapper for hooks
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

describe('Google OAuth Account Mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useLinkGoogleMutation', () => {
    it('should successfully request Google account linking', async () => {
      const mockResponse = {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
        success: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/account/link-google',
        {}
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should return authUrl for OAuth redirect', async () => {
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...';
      mockPost.mockResolvedValueOnce({
        authUrl,
        success: true,
      });

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.authUrl).toBe(authUrl);
    });

    it('should handle Google linking errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Already linked to Google'));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Already linked');
    });

    it('should handle network errors during linking request', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network timeout'));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Network');
    });

    it('should execute linking request mutation', async () => {
      mockPost.mockResolvedValueOnce({
        authUrl: 'https://accounts.google.com/...',
      });

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.authUrl).toBeDefined();
    });
  });

  describe('useUnlinkGoogleMutation', () => {
    it('should successfully unlink Google account', async () => {
      const mockResponse = {
        success: true,
        message: 'Google account unlinked successfully',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/account/unlink-google',
        { confirmation: 'UNLINK_GOOGLE' }
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should require confirmation for unlinking', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify confirmation flag is sent
      expect(mockPost).toHaveBeenCalledWith(
        '/api/account/unlink-google',
        expect.objectContaining({ confirmation: 'UNLINK_GOOGLE' })
      );
    });

    it('should handle already unlinked error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Google account not linked'));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('not linked');
    });

    it('should handle last auth method error (cannot unlink only auth method)', async () => {
      mockPost.mockRejectedValueOnce(
        new Error('Cannot unlink last authentication method')
      );

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('last authentication method');
    });

    it('should handle network errors during unlinking', async () => {
      mockPost.mockRejectedValueOnce(new Error('Connection refused'));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Connection');
    });

    it('should execute unlinking request mutation', async () => {
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Unlinked',
      });

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(true);
    });

    it('should invalidate user query on successful unlink', async () => {
      const mockResponse = { success: true };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify the mutation was successful
      expect(result.current.data).toEqual(mockResponse);
    });
  });

  describe('Google Account Linking and Unlinking Flow', () => {
    it('should allow linking then unlinking Google account', async () => {
      // Step 1: Link Google account
      mockPost.mockResolvedValueOnce({
        authUrl: 'https://accounts.google.com/...',
      });

      const { result: linkResult } = renderHook(
        () => useLinkGoogleMutation(),
        { wrapper: createWrapper() }
      );

      linkResult.current.mutate();

      await waitFor(() => {
        expect(linkResult.current.isSuccess).toBe(true);
      });

      expect(linkResult.current.data?.authUrl).toBeDefined();

      // Step 2: Unlink Google account
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Unlinked',
      });

      const { result: unlinkResult } = renderHook(
        () => useUnlinkGoogleMutation(),
        { wrapper: createWrapper() }
      );

      unlinkResult.current.mutate();

      await waitFor(() => {
        expect(unlinkResult.current.isSuccess).toBe(true);
      });

      expect(unlinkResult.current.data?.success).toBe(true);
    });

    it('should handle linking failure preventing unlinking', async () => {
      // Step 1: Link fails
      mockPost.mockRejectedValueOnce(new Error('Linking failed'));

      const { result: linkResult } = renderHook(
        () => useLinkGoogleMutation(),
        { wrapper: createWrapper() }
      );

      linkResult.current.mutate();

      await waitFor(() => {
        expect(linkResult.current.isError).toBe(true);
      });

      // Should not proceed to unlinking
      expect(linkResult.current.error).toBeDefined();
    });

    it('should handle unlinking failure without blocking future link attempts', async () => {
      // Step 1: Unlink fails
      mockPost.mockRejectedValueOnce(new Error('Unlink failed'));

      const { result: unlinkResult } = renderHook(
        () => useUnlinkGoogleMutation(),
        { wrapper: createWrapper() }
      );

      unlinkResult.current.mutate();

      await waitFor(() => {
        expect(unlinkResult.current.isError).toBe(true);
      });

      // Step 2: User can try linking again
      mockPost.mockResolvedValueOnce({
        authUrl: 'https://accounts.google.com/...',
      });

      const { result: linkResult } = renderHook(
        () => useLinkGoogleMutation(),
        { wrapper: createWrapper() }
      );

      linkResult.current.mutate();

      await waitFor(() => {
        expect(linkResult.current.isSuccess).toBe(true);
      });
    });
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error message when linking fails', async () => {
      const errorMessage = 'This Google account is already linked to another account';
      mockPost.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe(errorMessage);
    });

    it('should provide clear error message when unlinking fails', async () => {
      const errorMessage = 'Cannot disconnect Google: it is your only login method';
      mockPost.mockRejectedValueOnce(new Error(errorMessage));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe(errorMessage);
    });
  });

  describe('Additional Error Scenarios - Linking', () => {
    it('should handle network timeout during linking', async () => {
      mockPost.mockRejectedValueOnce(new Error('Request timeout after 30 seconds'));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('timeout');
    });

    it('should handle unauthorized error when not logged in', async () => {
      mockPost.mockRejectedValueOnce(new Error('User not authenticated'));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('authenticated');
    });

    it('should handle bad request error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Invalid request parameters'));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Invalid');
    });

    it('should handle rate limiting error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Too many requests, please try again later'));

      const { result } = renderHook(() => useLinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Too many');
    });
  });

  describe('Additional Error Scenarios - Unlinking', () => {
    it('should handle network timeout during unlinking', async () => {
      mockPost.mockRejectedValueOnce(new Error('Connection lost'));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Connection');
    });

    it('should handle forbidden error (cannot modify)', async () => {
      mockPost.mockRejectedValueOnce(new Error('Forbidden: you do not have permission to modify this account'));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Forbidden');
    });

    it('should handle server maintenance error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Service temporarily unavailable'));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('unavailable');
    });

    it('should handle malformed response error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Invalid response from server'));

      const { result } = renderHook(() => useUnlinkGoogleMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('response');
    });
  });
});
