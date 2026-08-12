import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

interface RequireAuthProps {
  children: React.ReactNode;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, isRestoringSession } = useAuth();
  const location = useLocation();

  // Previously this was reached only by genuinely logged-out visitors, because
  // a stored session made `isAuthenticated` true synchronously. The session now
  // starts empty on every load and is restored from the `payload-token` cookie,
  // so this is the normal path for a reload — it cannot stay a blank screen.
  // Same wording as LoginPage's restoring state, which covers the same wait.
  if (isRestoringSession && !isAuthenticated) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>Restoring session</h1>
            <p>Checking your AI Blog Writer login…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
