import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatLocationHierarchy as sharedFormatLocationHierarchy } from "@shared/utils/location-utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatLocationHierarchy = sharedFormatLocationHierarchy;

/**
 * Event handler that forces all input to be lowercase (typing, pasting, etc.)
 * @param event - The input event
 */
export function handleLowercaseInput(event: React.FormEvent<HTMLInputElement>) {
  const input = event.target as HTMLInputElement;
  const currentValue = input.value;
  const lowercaseValue = currentValue.toLowerCase();

  // Only update if the value actually changed
  if (currentValue !== lowercaseValue) {
    const cursorPosition = input.selectionStart || 0;
    input.value = lowercaseValue;

    // Restore cursor position
    input.setSelectionRange(cursorPosition, cursorPosition);
  }
}

/**
 * Event handler for paste events that forces the pasted text to be lowercase
 * @param event - The paste event
 */
export function handleLowercasePaste(event: React.ClipboardEvent<HTMLInputElement>) {
  event.preventDefault();
  const pastedText = event.clipboardData.getData('text');
  const lowercaseText = pastedText.toLowerCase();

  // Insert the lowercase text at the current cursor position
  const input = event.target as HTMLInputElement;
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const currentValue = input.value;

  // Replace selected text or insert at cursor position
  const newValue = currentValue.substring(0, start) + lowercaseText + currentValue.substring(end);
  input.value = newValue;

  // Trigger change event to update React state
  const changeEvent = new Event('input', { bubbles: true });
  input.dispatchEvent(changeEvent);

  // Set cursor position after the pasted text
  input.setSelectionRange(start + lowercaseText.length, start + lowercaseText.length);
}

/**
 * Convert a string to a URL-friendly slug format
 * - Converts to lowercase
 * - Normalizes accented characters (ã → a, ç → c, etc.)
 * - Replaces spaces with dashes
 * - Removes any characters that aren't lowercase letters, numbers, or hyphens
 *
 * @param text - The text to slugify
 * @returns Slugified string (e.g., "São Paulo" → "sao-paulo")
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD") // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .replace(/[^a-z0-9-]/g, "") // Remove invalid characters
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .replace(/^-|-$/g, ""); // Remove leading/trailing dashes
}

/**
 * Event handler that slugifies input (lowercase, no accents, dashes for spaces)
 * @param event - The input event
 */
export function handleSlugifyInput(event: React.FormEvent<HTMLInputElement>) {
  const input = event.target as HTMLInputElement;
  const currentValue = input.value;
  const slugifiedValue = slugify(currentValue);

  // Only update if the value actually changed
  if (currentValue !== slugifiedValue) {
    const cursorPosition = input.selectionStart || 0;
    input.value = slugifiedValue;

    // Restore cursor position (adjust for removed characters)
    const newPosition = Math.min(cursorPosition, slugifiedValue.length);
    input.setSelectionRange(newPosition, newPosition);
  }
}
