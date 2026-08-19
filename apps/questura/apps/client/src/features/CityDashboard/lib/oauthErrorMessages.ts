const oauthErrorMessages: Record<string, string> = {
  account_exists_local: 'This email has a password. You can link Google in account page.',
  oauth_failed: 'Google sign-in failed. Please try again or use password login.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  oauth_unreachable: 'We could not reach the sign-in service. Check your connection and try again.',
}

export function getOAuthErrorMessage(error: string | null): string {
  if (!error) return ''
  return oauthErrorMessages[error] ?? 'An authentication error occurred. Please try again.'
}
