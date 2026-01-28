/**
 * Hook for checking user account status
 */

import { useState, useCallback, useEffect } from 'react';
import { validateEmail } from '../lib/auth-utils';
import { getBackendUrl, getApiHeaders, isServiceUnavailableError } from '@/lib/api';
import type { UserAccountStatus } from '../types';

export const useAccountCheck = (prefillEmail?: string) => {
  const [userAccountStatus, setUserAccountStatus] = useState<UserAccountStatus | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [accountCheckError, setAccountCheckError] = useState<string | null>(null);

  const checkUserAccount = useCallback(async (email: string) => {
    if (!validateEmail(email)) return { status: null, error: null };

    console.log('🔍 Checking user account for email:', email);
    const url = `${getBackendUrl()}/api/user/check`;
    const headers = getApiHeaders();
    const body = JSON.stringify({ email });

    console.log('🌐 Request URL:', url);
    console.log('📋 Request headers:', headers);
    console.log('📦 Request body:', body);

    setCheckingAccount(true);
    setAccountCheckError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: body,
      });

      console.log('📡 API Response status:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ API Response data:', JSON.stringify(data, null, 2));

        // Map the backend response to our expected format
        const mappedData = {
          userExists: data.exists,
          hasPassword: data.authMethods?.hasPassword || data.authMethods?.local,
          hasGoogleAuth: data.authMethods?.hasGoogle || data.authMethods?.google,
          email: email
        };

        console.log('🔄 Mapped data:', JSON.stringify(mappedData, null, 2));
        setUserAccountStatus(mappedData);

        return { status: mappedData, error: null };
      } else {
        console.log('❌ API Response not ok:', response.status, response.statusText);
        const errorText = await response.text();
        console.log('❌ Error response body:', errorText);

        // Check if this is a service error (5xx, connection issues, HTML response)
        const isHtmlResponse = errorText.includes('<!DOCTYPE') || errorText.includes('<html');
        let errorMessage = 'Unable to check account';
        if (response.status >= 500 || isHtmlResponse) {
          errorMessage = 'Service is unavailable. Please try again later.';
        } else {
          errorMessage = `Error checking account: ${response.status} ${response.statusText}`;
        }

        setAccountCheckError(errorMessage);
        setUserAccountStatus(null);
        return { status: null, error: errorMessage };
      }
    } catch (error) {
      console.error('💥 Error checking user account:', error);

      // Detect if this is a service unavailability error
      let errorMessage = 'Unable to check account';
      if (isServiceUnavailableError(error)) {
        errorMessage = 'Service is unavailable. Please try again later.';
      } else {
        errorMessage = error instanceof Error ? error.message : 'Unable to check account';
      }

      setAccountCheckError(errorMessage);
      setUserAccountStatus(null);
      return { status: null, error: errorMessage };
    } finally {
      setCheckingAccount(false);
    }
  }, []);

  // Auto-check account if email is pre-filled
  useEffect(() => {
    if (prefillEmail && validateEmail(prefillEmail)) {
      checkUserAccount(prefillEmail).then(result => {
        if (result?.status) {
          setUserAccountStatus(result.status);
        }
        if (result?.error) {
          setAccountCheckError(result.error);
        }
      });
    }
  }, [prefillEmail, checkUserAccount]);

  return {
    userAccountStatus,
    checkingAccount,
    accountCheckError,
    checkUserAccount,
    setUserAccountStatus
  };
};
