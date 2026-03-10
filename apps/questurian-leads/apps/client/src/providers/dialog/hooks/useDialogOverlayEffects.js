import { useEffect, useRef } from 'react';

export function useDialogOverlayEffects({
  defaultFocus,
  onClose,
  type,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    const focusTarget =
      defaultFocus === 'cancel' ? cancelRef.current : confirmRef.current;
    focusTarget?.focus();
  }, [defaultFocus]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(type === 'confirm' ? false : true);
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, type]);

  return {
    cancelRef,
    confirmRef,
  };
}
