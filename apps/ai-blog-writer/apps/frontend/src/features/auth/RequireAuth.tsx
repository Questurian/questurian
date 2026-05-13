import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

interface RequireAuthProps {
  children: React.ReactNode;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, isRestoringSession } = useAuth();
  const location = useLocation();

  if (isRestoringSession && !isAuthenticated) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
