export function mapEmailChangeError(
  error: unknown,
  fallbackMessage: string,
  options?: { noPasswordSetMessage?: string }
): string {
  if (error instanceof Error) {
    if (options?.noPasswordSetMessage && error.message.includes('No password set')) {
      return options.noPasswordSetMessage;
    }
    return error.message;
  }

  return fallbackMessage;
}

export function buildEmailChangeSuccessUrl(newEmail: string, wasGoogleUnlinked: boolean): string {
  const params = new URLSearchParams();
  params.append('newEmail', newEmail);
  params.append('googleUnlinked', String(wasGoogleUnlinked));
  return `/account/email-changed-success?${params.toString()}`;
}
