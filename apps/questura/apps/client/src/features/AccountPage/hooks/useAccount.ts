import { useState } from "react";
import { useUnlinkGoogleMutation, useLinkGoogleMutation } from "./useAccountMutations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query";
import { isServiceUnavailableError } from "@/lib/api";

export function useAccount() {
  const queryClient = useQueryClient();

  // React Query mutations
  const linkGoogleMutation = useLinkGoogleMutation();
  const unlinkGoogleMutation = useUnlinkGoogleMutation();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const clearPasswordMessages = () => {
    setPasswordError(null);
    setPasswordSuccess(null);
  };

  const handleLinkGoogle = () => {
    clearMessages();
    linkGoogleMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.authUrl) {
          const linkingUrl = result.authUrl.includes('?')
            ? `${result.authUrl}&isLinking=true`
            : `${result.authUrl}?isLinking=true`;

          const popup = window.open(
            linkingUrl,
            'googleAuth',
            'width=500,height=600,scrollbars=yes,resizable=yes,toolbar=no,location=no,directories=no,status=no,menubar=no'
          );

          if (!popup) {
            setError('Popup blocked. Please allow popups for this site and try again.');
            return;
          }

          let messageReceived = false;

          const handleMessage = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
              messageReceived = true;
              popup.close();
              window.removeEventListener('message', handleMessage);
              // Invalidate and refetch user data
              try {
                await queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
                setSuccess('Google account linked successfully!');
              } catch {
                // Still consider it a success even if refetch fails - user data will update on next interaction
                setSuccess('Google account linked! (refresh pending)');
              }
            } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
              popup.close();
              setError(event.data.error || 'Google authentication failed');
              window.removeEventListener('message', handleMessage);
            }
          };

          window.addEventListener('message', handleMessage);

          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed);
              window.removeEventListener('message', handleMessage);
              // Only invalidate if message wasn't received (fallback for popup close)
              if (!messageReceived) {
                queryClient.invalidateQueries({ queryKey: queryKeys.userMe() }).catch((error) => {
                  // Log error but don't block - user can still use the app
                  if (process.env.NODE_ENV === 'development') {
                    console.error('Failed to refresh user data after popup close:', error);
                  }
                });
              }
            }
          }, 1000);
        } else if (result.success) {
          setSuccess('Google account linked successfully!');
        } else {
          setError('Unable to initiate Google authentication. Please try again.');
        }
      },
      onError: (error) => {
        if (isServiceUnavailableError(error)) {
          setError('Service is unavailable. Please try again later.');
        } else {
          setError(error instanceof Error ? error.message : 'An error occurred');
        }
      },
    });
  };

  const handleUnlinkGoogle = () => {
    clearMessages();
    unlinkGoogleMutation.mutate(undefined, {
      onSuccess: () => {
        setSuccess('Google account disconnected successfully!');
      },
      onError: (error) => {
        if (isServiceUnavailableError(error)) {
          setError('Service is unavailable. Please try again later.');
        } else {
          setError(error instanceof Error ? error.message : 'An error occurred');
        }
      },
    });
  };

  return {
    error,
    success,
    clearMessages,
    passwordError,
    passwordSuccess,
    clearPasswordMessages,
    setPasswordSuccess,
    handleLinkGoogle,
    handleUnlinkGoogle
  };
}