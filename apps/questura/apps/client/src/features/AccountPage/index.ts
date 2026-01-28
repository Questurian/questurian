// Page components
export { default as AccountPage } from './pages/AccountPage';
export { default as PasswordChangePage } from './pages/PasswordChangePage';
export { default as EmailChangePage } from './pages/EmailChangePage';

// Hooks
export { useAccount } from './hooks/useAccount';
export { 
  useAddPasswordMutation,
  useRemovePasswordMutation,
  useLinkGoogleMutation,
  useUnlinkGoogleMutation,
  useCanDisconnectQuery
} from './hooks/useAccountMutations';
export { 
  useRequestEmailChangeMutation,
  useConfirmEmailChangeMutation
} from './hooks/useEmailChangeMutations';
export {
  useChangePasswordMutation,
  useVerifyPasswordMutation,
  useRequestPasswordChangeMutation,
  useConfirmPasswordChangeMutation
} from './hooks/usePasswordChangeMutations';

// Types
export type { PasswordData } from './types';
