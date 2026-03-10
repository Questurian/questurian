import {
  DEFAULT_DIALOG_LABELS,
  DEFAULT_DIALOG_TITLES,
} from '../constants/dialog.constants';

export function createAlertDialog(message, options = {}, resolve) {
  return {
    confirmLabel: options.confirmLabel ?? DEFAULT_DIALOG_LABELS.alert,
    defaultFocus: options.defaultFocus ?? 'confirm',
    message: typeof message === 'string' ? message : String(message),
    resolve,
    title: options.title ?? DEFAULT_DIALOG_TITLES.alert,
    tone: options.tone ?? 'default',
    type: 'alert',
  };
}

export function createConfirmDialog(message, options = {}, resolve) {
  return {
    cancelLabel: options.cancelLabel ?? DEFAULT_DIALOG_LABELS.cancel,
    confirmLabel: options.confirmLabel ?? DEFAULT_DIALOG_LABELS.confirm,
    defaultFocus: options.defaultFocus ?? 'cancel',
    message: typeof message === 'string' ? message : String(message),
    resolve,
    title: options.title ?? DEFAULT_DIALOG_TITLES.confirm,
    tone: options.tone ?? 'default',
    type: 'confirm',
  };
}
