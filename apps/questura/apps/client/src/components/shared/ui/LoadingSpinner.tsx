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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full text-center space-y-4">
          <LoaderCircle 
            className="animate-spin mx-auto text-blue-500" 
            size={sizeMap[size]}
          />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {message}
          </h2>
          {subMessage && (
            <p className="text-gray-600 dark:text-gray-400">
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
        className={`animate-spin text-blue-600 ${className}`}
        size={sizeMap[size]}
      />
    );
  }

  return (
    <div className={`text-center ${className}`}>
      <LoaderCircle 
        className="animate-spin mx-auto text-blue-600" 
        size={sizeMap[size]}
      />
      <p className="mt-4 text-gray-600 dark:text-gray-400">{message}</p>
      {subMessage && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{subMessage}</p>
      )}
    </div>
  );
}