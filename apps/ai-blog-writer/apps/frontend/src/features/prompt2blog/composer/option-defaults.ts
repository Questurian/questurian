import type { Prompt2BlogInputOption } from '../api'

/**
 * The id a writing-profile list should start on: whichever option declares
 * itself the default, else the first one, else nothing.
 */
export function findDefaultOption(options: Prompt2BlogInputOption[]): string {
  return options.find(option => option.default)?.id || options[0]?.id || ''
}
