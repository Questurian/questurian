'use client';

import { useState } from 'react';

import { useSignOutEverywhereMutation } from '@/lib/user/hooks';
import {
  ACCOUNT_DELETION_DAYS,
  ACCOUNT_DELETION_EMAIL,
  ACCOUNT_DELETION_MAILTO,
} from '@/lib/accountDeletion';
import { accountActionLinkClassName } from '../account.styles';

/**
 * Signing out everywhere, and how to have the account deleted.
 *
 * Deletion is by email at launch (decision D2): no button, a promise with a
 * deadline. The request is handled by hand (docs/procedures/account-deletion.md).
 */
export function DevicesAndDataSection() {
  const [confirming, setConfirming] = useState(false);
  const signOutEverywhere = useSignOutEverywhereMutation();

  return (
    <div className="bg-paper border border-[#d7d4ce] rounded-sm p-4 480:p-6 768:p-8">
      <div className="flex flex-col 480:flex-row 480:justify-between 480:items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
            Signed-in devices
          </h3>
          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#6b6a68] leading-[1.65]">
            Signed in on a phone or a shared computer you no longer use? Sign out everywhere, this
            browser included. Other devices are signed out within seconds.
          </p>
        </div>

        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${accountActionLinkClassName} 480:ml-4 whitespace-nowrap mt-3 480:mt-0 self-start`}
          >
            Sign out of all devices
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[0.84rem] text-[#1A1A1A]">Sign out on every device, including this one?</span>
          <button
            type="button"
            onClick={() => signOutEverywhere.mutate()}
            disabled={signOutEverywhere.isPending}
            className="bg-[#2C2C2C] hover:bg-[#1A1A1A] text-white px-4 py-2 rounded text-[0.84rem] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signOutEverywhere.isPending ? 'Signing out…' : 'Sign out everywhere'}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              signOutEverywhere.reset();
            }}
            disabled={signOutEverywhere.isPending}
            className={accountActionLinkClassName}
          >
            Cancel
          </button>
        </div>
      )}

      {signOutEverywhere.isError && (
        <p role="alert" className="mt-3 text-[0.84rem] text-[#c62828]">
          {signOutEverywhere.error instanceof Error
            ? signOutEverywhere.error.message
            : 'Could not sign out of your other devices. Please try again.'}
        </p>
      )}

      <div className="mt-5 pt-5 border-t border-[#d7d4ce] 480:mt-6 480:pt-6">
        <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
          Delete your account
        </h3>
        <p className="text-[0.8rem] 480:text-[0.84rem] text-[#6b6a68] leading-[1.65]">
          Email{' '}
          <a href={ACCOUNT_DELETION_MAILTO} className="text-accent underline underline-offset-2">
            {ACCOUNT_DELETION_EMAIL}
          </a>{' '}
          from the address you sign in with and we delete your account within{' '}
          {ACCOUNT_DELETION_DAYS} days. Any membership is cancelled first, so you are not charged
          again.
        </p>
      </div>
    </div>
  );
}
