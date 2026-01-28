import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ToastProps {
  message: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function Toast({ message, position, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to trigger animation
    const timer = setTimeout(() => setIsVisible(true), 10);

    // Auto-hide after 1.25 seconds
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 200); // Wait for fade out animation
    }, 1250);

    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, [onClose]);

  return createPortal(
    <div
      className={`fixed z-50 px-2 py-1 bg-gray-800 text-white text-xs rounded-sm shadow-lg pointer-events-none transition-all duration-200 ${
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(8px, -50%)", // Position to the right, vertically centered
      }}
    >
      {message}
    </div>,
    document.body
  );
}

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    message: string;
    position: { x: number; y: number };
  }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          position={toast.position}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </>
  );
}
