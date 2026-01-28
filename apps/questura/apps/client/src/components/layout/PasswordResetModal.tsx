"use client";

import { useState } from 'react';
import EnhancedResetPasswordForm from '@/features/Auth/components/form/EnhancedResetPasswordForm';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export default function PasswordResetModal({
  isOpen,
  onClose,
  email
}: PasswordResetModalProps) {
  const [modalTitle, setModalTitle] = useState("Verify and Reset Password");
  const [modalSubtitle, setModalSubtitle] = useState("Enter the code we sent to your email");

  const handleSuccess = () => {
    onClose();
  };

  const handleStepChange = (currentStep: number) => {
    if (currentStep === 1) {
      setModalTitle("Verify and Reset Password");
      setModalSubtitle("Enter the code we sent to your email");
    } else if (currentStep === 2) {
      setModalTitle("Create New Password");
      setModalSubtitle("Enter your new password below");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      {/* Background overlay */}
      <div
        className="fixed inset-0 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      {/* Modal container */}
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center 640:block 640:p-0">
        <span className="hidden 640:inline-block 640:align-middle 640:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal content */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all 640:my-8 640:align-middle 640:max-w-md 640:w-full 640:p-6 relative z-[60] pointer-events-auto" role="dialog">
          <div className="absolute top-0 right-0 pt-4 pr-4 z-10">
            <button
              type="button"
              className="bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="640:flex 640:items-start">
            <div className="w-full mt-3 text-center 640:mt-0 640:text-left">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-2">
                {modalTitle}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {modalSubtitle}
              </p>

              <EnhancedResetPasswordForm
                key={isOpen ? 'open' : 'closed'}
                inModal={true}
                onSuccess={handleSuccess}
                prefillEmail={email}
                skipEmailStep={true}
                onStepChange={handleStepChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
