import { useDialogOverlayEffects } from '../hooks/useDialogOverlayEffects';

export default function DialogOverlay({
  dialog,
  onClose,
}) {
  const { cancelRef, confirmRef } = useDialogOverlayEffects({
    defaultFocus: dialog.defaultFocus,
    onClose,
    type: dialog.type,
  });

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
