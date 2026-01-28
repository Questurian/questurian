import { ISO_TO_PHONE_COUNTRY_CODE } from '../constants';

/**
 * Convert ISO country code to phone country code
 * e.g., "PE" -> "+51", "CO" -> "+57"
 */
export function convertIsoToPhoneCountryCode(isoCode?: string): string | undefined {
  if (!isoCode) return undefined;
  return ISO_TO_PHONE_COUNTRY_CODE[isoCode.toUpperCase()];
}

/**
 * Extract phone number without country code prefix
 * e.g., "+51 946 419 932" -> "946419932"
 */
export function extractPhoneNumber(fullPhoneNumber?: string): string | undefined {
  if (!fullPhoneNumber) return undefined;

  // Remove common country code prefixes first (before removing spaces)
  // Match patterns like +51, +1, +44, +1-CA, etc.
  let cleaned = fullPhoneNumber.replace(/^\+\d{1,3}(-[A-Z]{2})?\s*/, "");

  // Remove all spaces, hyphens, and parentheses
  cleaned = cleaned.replace(/[\s\-\(\)]/g, "");

  // Remove leading zeros if any
  cleaned = cleaned.replace(/^0+/, "");

  return cleaned || undefined;
}





