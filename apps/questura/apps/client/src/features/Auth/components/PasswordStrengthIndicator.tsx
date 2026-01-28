"use client";

import { PasswordRequirements } from '../lib/auth-utils';

interface PasswordStrengthIndicatorProps {
  requirements: PasswordRequirements;
}

export default function PasswordStrengthIndicator({ requirements }: PasswordStrengthIndicatorProps) {
  const requirementsList = [
    { key: 'hasMinLength', label: '8+ Characters', met: requirements.hasMinLength },
    { key: 'hasNumber', label: 'Number Character', met: requirements.hasNumber },
    { key: 'hasUppercase', label: 'Uppercase Letter', met: requirements.hasUppercase },
    { key: 'hasSymbol', label: 'Supported Symbol', met: requirements.hasSymbol },
  ];

  return (
    <div className="mt-3 space-y-2">
      {requirementsList.map((requirement) => (
        <div key={requirement.key} className="flex items-center gap-2">
          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
            requirement.met
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-gray-100 dark:bg-gray-700'
          }`}>
            {requirement.met ? (
              <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"></div>
            )}
          </div>
          <span className={`text-sm ${
            requirement.met
              ? 'text-green-700 dark:text-green-300 font-medium'
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {requirement.label}
          </span>
        </div>
      ))}
    </div>
  );
}
