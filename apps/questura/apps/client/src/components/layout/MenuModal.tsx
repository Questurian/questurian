"use client";

import { X } from "lucide-react";

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MenuModal({ isOpen, onClose }: MenuModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes slideInFromLeft {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .modal-slide-in-left {
          animation: slideInFromLeft 0.3s ease-out forwards;
        }

        .modal-overlay-fade {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>

      <div
        className={`
          /* Base styles */
          fixed inset-0 z-50 overflow-y-auto modal-slide-in-left
          /* 480px breakpoint */
          480:inset-y-0 480:left-0 480:right-auto 480:w-[440px]
        `}
      >
        {/* BACKGROUND OVERLAY - Dark 31 31 31 background covering entire page */}
        <div
          className={`
            /* Base styles */
            fixed inset-0 transition-opacity modal-overlay-fade cursor-auto
            /* 480px breakpoint */
            480:inset-y-0 480:left-0 480:right-auto 480:w-[440px]
          `}
          aria-hidden="true"
          style={{ backgroundColor: "#1f1f1f" }}
        ></div>

        {/* MODAL CONTAINER - Flexbox wrapper that centers the content */}
        <div
          className={`
            /* Base styles */
            flex flex-col items-center justify-center min-h-screen text-center relative z-50 w-full
            /* 480px breakpoint */
            480:min-h-screen
          `}
        >
          {/* CLOSE BUTTON - Top left X button */}
          <button
            onClick={onClose}
            className={`
              /* Base styles */
              absolute top-8 left-8
              p-2 bg-transparent border-0 cursor-pointer
              focus:outline-none transition-colors
              hover:opacity-80
            `}
            aria-label="Close modal"
          >
            <X className="w-8 h-8 text-white" />
          </button>

          {/* MODAL CONTENT - Centered text */}
          <div
            className={`
              /* Base styles */
              relative pointer-events-auto flex flex-col gap-6 items-center
            `}
          >
            <h1
              className={`
                /* Base styles */
                text-white text-4xl font-medium
                /* Underline effect */
                underline decoration-white underline-offset-4
                480:text-5xl
              `}
            >
              hello bub
            </h1>
          </div>
        </div>
      </div>
    </>
  );
}
