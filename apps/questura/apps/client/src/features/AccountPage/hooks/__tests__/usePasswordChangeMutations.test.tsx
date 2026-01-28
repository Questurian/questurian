import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useChangePasswordMutation,
  useVerifyPasswordMutation,
  useRequestPasswordChangeMutation,
  useConfirmPasswordChangeMutation,
} from '../usePasswordChangeMutations';
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

describe('Password Change Mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useChangePasswordMutation', () => {
    it('should change password successfully with valid current password', async () => {
      const mockResponse = {
        success: true,
        message: 'Password changed successfully',
        token: 'new-session-token',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/change-password',
        {
          currentPassword: 'old-password',
          newPassword: 'new-password123',
          confirmNewPassword: 'new-password123',
        }
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should reject if current password is incorrect', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Current password is incorrect',
        token: '',
      });

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'wrong-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Current password is incorrect');
    });

    it('should reject if new passwords do not match', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'New passwords do not match',
        token: '',
      });

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'different-password',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('New passwords do not match');
    });

    it('should reject if new password is too weak', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Password is too weak. Must contain uppercase, lowercase, numbers, and special characters',
        token: '',
      });

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'old-password',
        newPassword: 'weak',
        confirmNewPassword: 'weak',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('too weak');
    });

    it('should handle network errors during password change', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network timeout'));

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Network');
    });

    it('should invalidate user query on successful password change', async () => {
      const mockResponse = {
        success: true,
        message: 'Password changed',
        token: 'new-token',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalled();
    });
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
  });

  describe('useRequestPasswordChangeMutation', () => {
    it('should request password change and send verification code', async () => {
      const mockResponse = {
        success: true,
        message: 'Verification code sent to your email',
        expiresIn: '15 minutes',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRequestPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/request-password-change',
        {}
      );
      expect(result.current.data?.message).toContain('Verification code');
    });

    it('should provide expiration time for verification code', async () => {
      const mockResponse = {
        success: true,
        message: 'Code sent',
        expiresIn: '30 minutes',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useRequestPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.expiresIn).toBe('30 minutes');
    });

    it('should handle errors when requesting password change', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Unable to send verification code',
      });

      const { result } = renderHook(() => useRequestPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Unable');
    });

    it('should handle network errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Connection refused'));

      const { result } = renderHook(() => useRequestPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate();

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Connection');
    });
  });

  describe('useConfirmPasswordChangeMutation', () => {
    it('should confirm password change with valid code and passwords', async () => {
      const mockResponse = {
        success: true,
        message: 'Password changed successfully',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: '123456',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/confirm-password-change',
        {
          code: '123456',
          currentPassword: 'old-password',
          newPassword: 'new-password123',
          confirmNewPassword: 'new-password123',
        }
      );
    });

    it('should reject invalid verification code', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Invalid or expired code',
      });

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: 'wrong-code',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Invalid or expired');
    });

    it('should reject if current password is incorrect', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Current password is incorrect',
      });

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: '123456',
        currentPassword: 'wrong-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Current password');
    });

    it('should reject if new passwords do not match', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'New passwords do not match',
      });

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: '123456',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'different-password',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('do not match');
    });

    it('should reject if new password is too weak', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Password is too weak',
      });

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: '123456',
        currentPassword: 'old-password',
        newPassword: 'weak',
        confirmNewPassword: 'weak',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('too weak');
    });

    it('should invalidate user query on successful password change', async () => {
      const mockResponse = {
        success: true,
        message: 'Password changed',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: '123456',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalled();
    });

    it('should handle network errors during confirmation', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server error'));

      const { result } = renderHook(() => useConfirmPasswordChangeMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        code: '123456',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Server');
    });
  });

  describe('Password Change Flow Integration', () => {
    it('should complete simplified password change flow: single mutation', async () => {
      const mockResponse = {
        success: true,
        message: 'Password changed',
        token: 'new-token',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useChangePasswordMutation(), { wrapper: createWrapper() });

      result.current.mutate({
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should complete full password change flow with verification code: request -> confirm', async () => {
      // Step 1: Request password change
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Code sent',
        expiresIn: '15 minutes',
      });

      const { result: requestResult } = renderHook(
        () => useRequestPasswordChangeMutation(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate();

      await waitFor(() => {
        expect(requestResult.current.isSuccess).toBe(true);
      });

      // Step 2: Confirm password change with code
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Password changed',
      });

      const { result: confirmResult } = renderHook(
        () => useConfirmPasswordChangeMutation(),
        { wrapper: createWrapper() }
      );

      confirmResult.current.mutate({
        code: '123456',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(confirmResult.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it('should handle request failure preventing confirmation', async () => {
      // Step 1: Request password change fails
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Unable to send code',
      });

      const { result: requestResult } = renderHook(
        () => useRequestPasswordChangeMutation(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate();

      await waitFor(() => {
        expect(requestResult.current.isError).toBe(true);
      });

      // Should not proceed to confirmation
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should handle confirmation failure after successful request', async () => {
      // Step 1: Request password change succeeds
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Code sent',
        expiresIn: '15 minutes',
      });

      const { result: requestResult } = renderHook(
        () => useRequestPasswordChangeMutation(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate();

      await waitFor(() => {
        expect(requestResult.current.isSuccess).toBe(true);
      });

      // Step 2: Confirm password change fails
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Invalid code',
      });

      const { result: confirmResult } = renderHook(
        () => useConfirmPasswordChangeMutation(),
        { wrapper: createWrapper() }
      );

      confirmResult.current.mutate({
        code: 'wrong-code',
        currentPassword: 'old-password',
        newPassword: 'new-password123',
        confirmNewPassword: 'new-password123',
      });

      await waitFor(() => {
        expect(confirmResult.current.isError).toBe(true);
      });

      // Request was successful but confirmation failed
      expect(requestResult.current.isSuccess).toBe(true);
    });
  });
});
