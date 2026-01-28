"use client";

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/user/hooks';
import { useLinkGoogleMutation } from '@/features/AccountPage/hooks/useAccountMutations';
import GoogleLinkingFlow from '../components/google/GoogleLinkingFlow';

export default function LinkGooglePage() {
  const router = useRouter();
  const { loading, isAuthenticated, user } = useAuth();
  const linkGoogleMutation = useLinkGoogleMutation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-6">
            Please log in to link your Google account.
          </p>
          <a
            href="/login"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  if (user?.hasGoogleOAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <div className="text-green-600 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Google Already Linked</h1>
          <p className="text-gray-600 mb-6">
            Your Google account is already linked to this account.
          </p>
          <button
            onClick={() => router.push('/auth-settings')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
          >
            Go to Auth Settings
          </button>
        </div>
      </div>
    );
  }

  // Enhanced popup detection
  const isPopup = typeof window !== 'undefined' && (
    (window.opener && window.opener !== window) ||
    window.name === 'googleAuth' ||
    (window.outerWidth < 600 && window.outerHeight < 700)
  );
  
  // If we're in a popup, redirect directly to Google OAuth instead of showing the UI
  if (isPopup && isAuthenticated && user && !user.hasGoogleOAuth) {
    console.log('Link-google page: In popup mode, redirecting directly to Google OAuth');
    
    // Call linkGoogleMutation to get the auth URL and go there directly
    linkGoogleMutation.mutateAsync().then(result => {
      if (result.authUrl) {
        console.log('Redirecting popup to Google OAuth:', result.authUrl);
        window.location.href = result.authUrl;
      } else {
        console.log('No auth URL, closing popup');
        window.close();
      }
    }).catch(error => {
      console.error('Error getting Google OAuth URL:', error);
      window.close();
    });
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to Google...</p>
        </div>
      </div>
    );
  }
  
  const handleSuccess = () => {
    console.log('Link-google handleSuccess called, isPopup:', isPopup);
    if (isPopup) {
      // Send success message to parent and close popup
      console.log('Sending success message to parent and closing popup');
      window.opener.postMessage({
        type: 'GOOGLE_AUTH_SUCCESS'
      }, window.location.origin);
      window.close();
    } else {
      console.log('Not in popup, redirecting to dashboard');
      router.push('/account');
    }
  };

  const handleCancel = () => {
    console.log('Link-google handleCancel called, isPopup:', isPopup);
    if (isPopup) {
      // Just close popup on cancel
      console.log('Closing popup on cancel');
      window.close();
    } else {
      console.log('Not in popup, redirecting to dashboard on cancel');
      router.push('/account');
    }
  };

  // If we're in popup mode, don't render GoogleLinkingFlow at all
  if (isPopup) {
    console.log('In popup mode - not rendering GoogleLinkingFlow component');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Processing...</p>
        </div>
      </div>
    );
  }

  return (
    <GoogleLinkingFlow
      standalone={true}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );
}