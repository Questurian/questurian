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
