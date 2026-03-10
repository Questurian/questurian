import { useCallback, useMemo, useRef, useState } from 'react';
import {
  createAlertDialog,
  createConfirmDialog,
} from '../utils/dialogDescriptors';

export function useDialogQueue() {
  const [dialog, setDialog] = useState(null);
  const queueRef = useRef([]);

  const enqueue = useCallback((entry) => {
    queueRef.current.push(entry);
    setDialog((current) => current ?? queueRef.current.shift() ?? null);
  }, []);

  const closeDialog = useCallback((result) => {
    setDialog((current) => {
      current?.resolve?.(result);
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const alert = useCallback(
    (message, options = {}) =>
      new Promise((resolve) => {
        enqueue(createAlertDialog(message, options, resolve));
      }),
    [enqueue],
  );

  const confirm = useCallback(
    (message, options = {}) =>
      new Promise((resolve) => {
        enqueue(createConfirmDialog(message, options, resolve));
      }),
    [enqueue],
  );

  const api = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return {
    api,
    closeDialog,
    dialog,
  };
}
