"use client";

import { useState } from "react";
import { EnhancedAuthForm } from "@/features/Auth";
import { ChevronsLeft } from 'lucide-react'; 
interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
  errorMessage?: string;
  prefillEmail?: string;
}



const BackArrow = () => {
  return (
    <ChevronsLeft className="w-6 h-6" />
  );
};



export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  title: customTitle,
  subtitle: customSubtitle,
  errorMessage,
  prefillEmail,
}: LoginModalProps) {
  const [modalTitle, setModalTitle] = useState("Sign In To Questurian");
  const [modalSubtitle, setModalSubtitle] = useState(
    "Sign in to your account or create a new one"
  );

  const handleSuccess = () => {
    onClose();
    onSuccess?.();
  };

  const handleModeChange = (isSignUp: boolean, showPasswordStep: boolean) => {
    if (!customTitle && showPasswordStep) {
      setModalTitle(isSignUp ? "Create Your Account" : "Welcome Back");
      setModalSubtitle(
        isSignUp
          ? "Set up your password to create your account"
          : "Enter your password to sign in"
      );
    } else if (!customTitle && !showPasswordStep) {
      setModalTitle("Sign In To Questurian  ");
      setModalSubtitle(
        "Don’t have an account yet? We’ll use the email address you enter to set one up for you."
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`
      /* Base styles */
      fixed inset-0 z-50 overflow-y-auto
    `}
    >
      {/* BACKGROUND OVERLAY - Dark semi-transparent background behind modal */}
      <div
        className={`
          /* Base styles */
          fixed inset-0 bg-black/30 transition-opacity
        `}
        onClick={onClose}
        aria-hidden="true"
      ></div>

      {/* MODAL CONTAINER - Flexbox wrapper that centers/positions the modal */}
      <div
        className={`
        /* Base styles */
        flex items-center justify-center min-h-screen pb-20 text-center
      

      `}
      >
        {/* MODAL CONTENT - White box containing form and text */}
        <div
          className={`
          /* Base styles */
          w-full bg-white pt-8 px-4 text-left overflow-hidden shadow-xl transform transition-all relative z-50 pointer-events-auto h-[90vh] mt-[10vh]
          /* 480px breakpoint */
          480:max-w-[640px] 480:h-auto 480:mt-0 480:rounded-md
          480:py-10 480:px-5

          
          



        `}
          style={{ boxShadow: "0 20px 25px -5px rgba(31, 31, 31, 0.1)" }}
        >
          {/* CONTENT WRAPPER - Flex container for title/subtitle and form */}
          <div
            className={`
            /* Base styles */
            flex flex-col items-center w-full


          `}
          >
            {/* Return BUTTON - At top of content flow */}
            <div
              className={`
              /* Base styles */
              w-full mb-8 text-[1rem] font-[Roboto] font-light
            `}
            >
              <button
                type="button"
                className={`
                  /* Base styles */
                  inline-flex items-center gap-1 text-black cursor-pointer transition-colors text-[18px]  p-0 bg-transparent border-0 focus:outline-none leading-none h-6
                `}
                onClick={onClose}
              >
                  <ChevronsLeft className="w-6 h-6 flex-shrink-0" />
                  <span className="leading-tight
                  ">Return</span>
              </button>
            </div>
            {/* TEXT & FORM SECTION - Title, subtitle, and auth form */}
            <div
              className={`
              /* Base styles */
              text-left w-full 
               480:w-[430px] 480:py-5

            `}
            >
              <h3
                className={`
                /* Base styles */
                text-3xl leading-6 font-medium text-zinc-900 mb-4 font-[Quattrocento]
                480:text-4xl
              `}
              >
                {customTitle || modalTitle}
              </h3>
              <p
                className={`
                /* Base styles */
                text-[1rem] text-black mb-3 h-14 line-clamp-2 font-[Roboto] font-light
              `}
              >
                {customSubtitle || modalSubtitle}
              </p>

              <EnhancedAuthForm
                key={isOpen ? "open" : "closed"}
                inModal={true}
                onSuccess={handleSuccess}
                errorMessage={errorMessage}
                prefillEmail={prefillEmail}
                onModeChange={handleModeChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
