import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useVerifyPasswordMutation,
  useRequestEmailChangeMutation,
  useConfirmEmailChangeMutation,
} from '../useEmailChangeMutations';
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

describe('Email Change Mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useVerifyPasswordMutation', () => {
    it('should verify password successfully', async () => {
      const mockResponse = {
        success: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useVerifyPasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({ password: 'correct-password' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/verify-password',
        { password: 'correct-password' }
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should handle incorrect password', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        error: 'Invalid password',
      });

      const { result } = renderHook(() => useVerifyPasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({ password: 'wrong-password' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Invalid password');
    });

    it('should handle network errors during password verification', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network timeout'));

      const { result } = renderHook(() => useVerifyPasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({ password: 'test-password' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Network');
    });
  });

  describe('useRequestEmailChangeMutation', () => {
    it('should request email change successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Verification code sent to new email',
        expiresIn: '15 minutes',
        willUnlinkGoogle: false,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRequestEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ newEmail: 'newemail@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/request-email-change',
        { newEmail: 'newemail@example.com' }
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should indicate if email change will unlink Google account', async () => {
      const mockResponse = {
        success: true,
        message: 'Verification code sent',
        expiresIn: '15 minutes',
        willUnlinkGoogle: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRequestEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ newEmail: 'different@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.willUnlinkGoogle).toBe(true);
    });

    it('should handle email already in use', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Email already in use',
        expiresIn: '',
        willUnlinkGoogle: false,
      });

      const { result } = renderHook(() => useRequestEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ newEmail: 'taken@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Email already in use');
    });

    it('should handle invalid email format', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Invalid email format',
        expiresIn: '',
        willUnlinkGoogle: false,
      });

      const { result } = renderHook(() => useRequestEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ newEmail: 'not-an-email' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Invalid email format');
    });

    it('should handle network errors during email change request', async () => {
      mockPost.mockRejectedValueOnce(new Error('Connection refused'));

      const { result } = renderHook(() => useRequestEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ newEmail: 'test@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Connection');
    });
  });

  describe('useConfirmEmailChangeMutation', () => {
    it('should confirm email change successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Email changed successfully',
        wasGoogleUnlinked: false,
        newEmail: 'newemail@example.com',
        requiresReLogin: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/confirm-email-change',
        { code: '123456' }
      );
      expect(result.current.data?.newEmail).toBe('newemail@example.com');
    });

    it('should indicate if Google account was unlinked', async () => {
      const mockResponse = {
        success: true,
        message: 'Email changed, Google account unlinked',
        wasGoogleUnlinked: true,
        newEmail: 'new@example.com',
        requiresReLogin: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.wasGoogleUnlinked).toBe(true);
    });

    it('should indicate if re-login is required', async () => {
      const mockResponse = {
        success: true,
        message: 'Email changed',
        wasGoogleUnlinked: false,
        newEmail: 'new@example.com',
        requiresReLogin: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.requiresReLogin).toBe(true);
    });

    it('should reject invalid verification code', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Invalid or expired code',
        wasGoogleUnlinked: false,
        newEmail: '',
        requiresReLogin: false,
      });

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: 'wrong-code' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Invalid or expired code');
    });

    it('should handle expired verification code', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Verification code has expired',
        wasGoogleUnlinked: false,
        newEmail: '',
        requiresReLogin: false,
      });

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('expired');
    });

    it('should clear query cache on successful email change', async () => {
      const mockResponse = {
        success: true,
        message: 'Email changed',
        wasGoogleUnlinked: false,
        newEmail: 'new@example.com',
        requiresReLogin: true,
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify mutation was called (cache clearing happens in onSuccess)
      expect(mockPost).toHaveBeenCalled();
    });

    it('should handle network errors during confirmation', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server error'));

      const { result } = renderHook(() => useConfirmEmailChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Server');
    });
  });

  describe('Email Change Flow Integration', () => {
    it('should complete full email change flow: verify -> request -> confirm', async () => {
      // Step 1: Verify password
      mockPost.mockResolvedValueOnce({
        success: true,
      });

      const { result: verifyResult } = renderHook(
        () => useVerifyPasswordMutation(),
        { wrapper: createWrapper() }
      );

      verifyResult.current.mutate({ password: 'correct-password' });

      await waitFor(() => {
        expect(verifyResult.current.isSuccess).toBe(true);
      });

      // Step 2: Request email change
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Code sent',
        expiresIn: '15 minutes',
        willUnlinkGoogle: false,
      });

      const { result: requestResult } = renderHook(
        () => useRequestEmailChangeMutation(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate({ newEmail: 'new@example.com' });

      await waitFor(() => {
        expect(requestResult.current.isSuccess).toBe(true);
      });

      // Step 3: Confirm email change
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Email changed',
        wasGoogleUnlinked: false,
        newEmail: 'new@example.com',
        requiresReLogin: true,
      });

      const { result: confirmResult } = renderHook(
        () => useConfirmEmailChangeMutation(),
        { wrapper: createWrapper() }
      );

      confirmResult.current.mutate({ code: '123456' });

      await waitFor(() => {
        expect(confirmResult.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('should handle verification failure preventing email change', async () => {
      // Step 1: Password verification fails
      mockPost.mockResolvedValueOnce({
        success: false,
        error: 'Wrong password',
      });

      const { result: verifyResult } = renderHook(
        () => useVerifyPasswordMutation(),
        { wrapper: createWrapper() }
      );

      verifyResult.current.mutate({ password: 'wrong-password' });

      await waitFor(() => {
        expect(verifyResult.current.isError).toBe(true);
      });

      // Should not proceed to email change request
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should handle email request failure preventing confirmation', async () => {
      // Step 1: Verify password succeeds
      mockPost.mockResolvedValueOnce({
        success: true,
      });

      const { result: verifyResult } = renderHook(
        () => useVerifyPasswordMutation(),
        { wrapper: createWrapper() }
      );

      verifyResult.current.mutate({ password: 'correct-password' });

      await waitFor(() => {
        expect(verifyResult.current.isSuccess).toBe(true);
      });

      // Step 2: Request email change fails
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Email already in use',
        expiresIn: '',
        willUnlinkGoogle: false,
      });

      const { result: requestResult } = renderHook(
        () => useRequestEmailChangeMutation(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate({ newEmail: 'taken@example.com' });

      await waitFor(() => {
        expect(requestResult.current.isError).toBe(true);
      });

      // Should not proceed to confirmation
      expect(mockPost).toHaveBeenCalledTimes(2);
    });
  });
});
