import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePasswordResetRequest } from '../usePasswordResetRequest';
import { usePasswordResetVerify, VerifyCodeError } from '../usePasswordResetVerify';
import { post, apiRequest } from '@/lib/api';

// Mock the API
jest.mock('@/lib/api');

const mockPost = post as jest.MockedFunction<typeof post>;
const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

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

describe('Password Reset Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('usePasswordResetRequest', () => {
    it('should request password reset with valid email', async () => {
      const mockResponse = {
        success: true,
        message: 'Password reset code sent to your email',
        expiresIn: '15 minutes',
      };
      mockApiRequest.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => usePasswordResetRequest(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/auth/forgot-password/request',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should handle error when reset request fails', async () => {
      mockApiRequest.mockRejectedValueOnce(
        new Error('Email not found')
      );

      const { result } = renderHook(() => usePasswordResetRequest(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'nonexistent@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Email not found');
    });

    it('should handle server error response', async () => {
      mockApiRequest.mockResolvedValueOnce({
        success: false,
        message: 'Server error: unable to send reset email',
      });

      const { result } = renderHook(() => usePasswordResetRequest(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe(
        'Server error: unable to send reset email'
      );
    });

    it('should provide expiration time in response', async () => {
      const mockResponse = {
        success: true,
        message: 'Reset code sent',
        expiresIn: '30 minutes',
      };
      mockApiRequest.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => usePasswordResetRequest(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.expiresIn).toBe('30 minutes');
    });
  });

  describe('usePasswordResetVerify', () => {
    it('should verify reset code with email and code', async () => {
      const mockResponse = {
        success: true,
        message: 'Code verified successfully',
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => usePasswordResetVerify(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com', code: '123456' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/auth/forgot-password/verify-code',
        { email: 'test@example.com', code: '123456' }
      );
      expect(result.current.data).toEqual(mockResponse);
    });

    it('should reject invalid code', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Invalid or expired code',
        code: 'INVALID_CODE',
      });

      const { result } = renderHook(() => usePasswordResetVerify(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com', code: 'wrong123' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Invalid or expired code');
    });

    it('should reject expired code', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Code has expired',
        code: 'CODE_EXPIRED',
      });

      const { result } = renderHook(() => usePasswordResetVerify(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com', code: '123456' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(VerifyCodeError);
      expect((result.current.error as VerifyCodeError).errorCode).toBe(
        'CODE_EXPIRED'
      );
    });

    it('should handle network errors during verification', async () => {
      mockPost.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const { result } = renderHook(() => usePasswordResetVerify(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com', code: '123456' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('Network');
    });

    it('should include error code in VerifyCodeError', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Too many attempts',
        code: 'TOO_MANY_ATTEMPTS',
      });

      const { result } = renderHook(() => usePasswordResetVerify(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'test@example.com', code: '123456' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(VerifyCodeError);
      expect((result.current.error as VerifyCodeError).errorCode).toBe(
        'TOO_MANY_ATTEMPTS'
      );
    });
  });

  describe('Password Reset Flow Integration', () => {
    it('should complete full reset flow: request -> verify', async () => {
      // Step 1: Request reset code
      mockApiRequest.mockResolvedValueOnce({
        success: true,
        message: 'Code sent',
        expiresIn: '15 minutes',
      });

      const { result: requestResult } = renderHook(
        () => usePasswordResetRequest(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate({ email: 'test@example.com' });

      await waitFor(() => {
        expect(requestResult.current.isSuccess).toBe(true);
      });

      // Step 2: Verify code
      mockPost.mockResolvedValueOnce({
        success: true,
        message: 'Code verified',
      });

      const { result: verifyResult } = renderHook(
        () => usePasswordResetVerify(),
        { wrapper: createWrapper() }
      );

      verifyResult.current.mutate({
        email: 'test@example.com',
        code: '123456',
      });

      await waitFor(() => {
        expect(verifyResult.current.isSuccess).toBe(true);
      });

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should handle error in middle of flow', async () => {
      // Step 1: Request succeeds
      mockApiRequest.mockResolvedValueOnce({
        success: true,
        message: 'Code sent',
        expiresIn: '15 minutes',
      });

      const { result: requestResult } = renderHook(
        () => usePasswordResetRequest(),
        { wrapper: createWrapper() }
      );

      requestResult.current.mutate({ email: 'test@example.com' });

      await waitFor(() => {
        expect(requestResult.current.isSuccess).toBe(true);
      });

      // Step 2: Verify fails
      mockPost.mockResolvedValueOnce({
        success: false,
        message: 'Invalid code',
        code: 'INVALID_CODE',
      });

      const { result: verifyResult } = renderHook(
        () => usePasswordResetVerify(),
        { wrapper: createWrapper() }
      );

      verifyResult.current.mutate({
        email: 'test@example.com',
        code: 'wrong',
      });

      await waitFor(() => {
        expect(verifyResult.current.isError).toBe(true);
      });

      // Request should still be successful
      expect(requestResult.current.isSuccess).toBe(true);
    });
  });
});
