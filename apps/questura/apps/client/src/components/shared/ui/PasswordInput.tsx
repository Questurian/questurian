/**
 * Reusable password input with show/hide toggle.
 * Matches the account / email-change form fields.
 */

import { useState, type ChangeEvent } from 'react';

interface PasswordInputProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

export default function PasswordInput({
  value,
  onChange,
  error,
  label = "Password",
  placeholder = "Password",
  disabled = false,
  required = false,
  autoComplete = "current-password",
  autoFocus = false,
  id,
  name,
  className,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      {label && (
        <label
          htmlFor={id || name}
          className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id || name}
          name={name}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          className={`
            w-full px-3.5 py-2.5 pr-14 border rounded-sm
            text-[0.88rem] text-[#1A1A1A] placeholder-[#c4c2be]
            bg-white transition-colors
            focus:outline-none focus:border-[#1A1A1A]
            disabled:opacity-50
            ${error ? 'border-[#f8bbd0]' : 'border-[#d7d4ce]'}
            ${className || ''}
          `}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.78rem] text-[#6b6a68] hover:text-[#1A1A1A] transition-colors cursor-pointer z-20"
          tabIndex={-1}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-[0.84rem] text-[#c62828]">
          {error}
        </p>
      )}
    </div>
  );
}
