import { createPortal } from 'react-dom';
import { DialogContext } from './DialogContext';
import DialogOverlay from './components/DialogOverlay';
import { useDialogQueue } from './hooks/useDialogQueue';

export function DialogProvider({ children }) {
  const queue = useDialogQueue();

  return (
    <DialogContext.Provider value={queue.api}>
      {children}
      {queue.dialog
        ? createPortal(
            <DialogOverlay dialog={queue.dialog} onClose={queue.closeDialog} />,
            document.body,
          )
        : null}
    </DialogContext.Provider>
  );
}
