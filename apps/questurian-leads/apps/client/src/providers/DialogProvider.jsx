import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const DialogContext = createContext(null);

const DEFAULT_TITLES = {
  alert: 'Notice',
  confirm: 'Confirm',
};

const DEFAULT_LABELS = {
  alert: 'OK',
  confirm: 'Confirm',
  cancel: 'Cancel',
};

function DialogOverlay({ dialog, onClose }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    const focusTarget =
      dialog.defaultFocus === 'cancel' ? cancelRef.current : confirmRef.current;
    focusTarget?.focus();
  }, [dialog]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (dialog.type === 'confirm') {
          onClose(false);
        } else {
          onClose(true);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dialog, onClose]);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog"
        data-tone={dialog.tone}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
      >
        <h2 className="dialog-title" id="dialog-title">
          {dialog.title}
        </h2>
        <p className="dialog-message" id="dialog-message">
          {dialog.message}
        </p>
        <div className="dialog-actions">
          {dialog.type === 'confirm' && (
            <button
              className="button secondary"
              type="button"
              onClick={() => onClose(false)}
              ref={cancelRef}
            >
              {dialog.cancelLabel}
            </button>
          )}
          <button
            className={`button${dialog.tone === 'danger' ? ' danger' : ''}`}
            type="button"
            onClick={() => onClose(true)}
            ref={confirmRef}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const queueRef = useRef([]);

  const enqueue = useCallback((entry) => {
    queueRef.current.push(entry);
    setDialog((current) => current ?? queueRef.current.shift());
  }, []);

  const closeDialog = useCallback(
    (result) => {
      if (dialog?.resolve) {
        dialog.resolve(result);
      }
      setDialog(queueRef.current.shift() ?? null);
    },
    [dialog],
  );

  const alert = useCallback(
    (message, options = {}) =>
      new Promise((resolve) => {
        enqueue({
          type: 'alert',
          title: options.title ?? DEFAULT_TITLES.alert,
          message: typeof message === 'string' ? message : String(message),
          confirmLabel: options.confirmLabel ?? DEFAULT_LABELS.alert,
          tone: options.tone ?? 'default',
          defaultFocus: options.defaultFocus ?? 'confirm',
          resolve,
        });
      }),
    [enqueue],
  );

  const confirm = useCallback(
    (message, options = {}) =>
      new Promise((resolve) => {
        enqueue({
          type: 'confirm',
          title: options.title ?? DEFAULT_TITLES.confirm,
          message: typeof message === 'string' ? message : String(message),
          confirmLabel: options.confirmLabel ?? DEFAULT_LABELS.confirm,
          cancelLabel: options.cancelLabel ?? DEFAULT_LABELS.cancel,
          tone: options.tone ?? 'default',
          defaultFocus: options.defaultFocus ?? 'cancel',
          resolve,
        });
      }),
    [enqueue],
  );

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog
        ? createPortal(
            <DialogOverlay dialog={dialog} onClose={closeDialog} />,
            document.body,
          )
        : null}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}
