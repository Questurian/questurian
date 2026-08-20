import { LoaderCircle } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  subMessage?: string;
  className?: string;
  variant?: 'default' | 'fullscreen' | 'inline';
  size?: 'small' | 'medium' | 'large';
}

export default function LoadingSpinner({
  message = "Loading...",
  subMessage,
  className = "",
  variant = 'default',
  size = 'medium'
}: LoadingSpinnerProps) {
  // Size mappings for spinner
  const sizeMap = {
    small: 16,
    medium: 48,
    large: 64,
  };

  if (variant === 'fullscreen') {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-md w-full text-center space-y-4">
          <LoaderCircle
            className="animate-spin mx-auto text-[#2C2C2C]"
            size={sizeMap[size]}
          />
          <h2 className="font-display text-[1.35rem] text-[#1A1A1A]">
            {message}
          </h2>
          {subMessage && (
            <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65]">
              {subMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <LoaderCircle
        className={`animate-spin text-[#2C2C2C] ${className}`}
        size={sizeMap[size]}
      />
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <LoaderCircle
        className="animate-spin mx-auto text-[#2C2C2C]"
        size={sizeMap[size]}
      />
      <p className="mt-4 text-[0.88rem] text-[#6b6a68]">{message}</p>
      {subMessage && (
        <p className="mt-2 text-[0.78rem] text-[#9a9894]">{subMessage}</p>
      )}
    </div>
  );
}
