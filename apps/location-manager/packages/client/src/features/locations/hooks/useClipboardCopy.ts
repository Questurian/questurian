import { useToast } from "@client/shared/hooks/useToast";

/**
 * Hook for copying text to clipboard with toast feedback
 * @returns Function to copy text with toast notification positioned at click location
 */
export function useClipboardCopy() {
  const { showToast } = useToast();

  const copyToClipboard = async (value: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click handlers

    try {
      await navigator.clipboard.writeText(value);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      showToast('Copied', {
        x: rect.right,
        y: rect.top + rect.height / 2, // Position to the right, vertically centered
      });
    } catch (error) {
      console.error('Failed to copy text: ', error);
    }
  };

  return { copyToClipboard };
}
