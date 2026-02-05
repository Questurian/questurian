import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

export default function Login() {
  const { isAuthenticated, login, isConnected, connectionError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (error) {
      setErrorMessage((error as Error).message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Log in to AI Blog Writer</h1>
          <p>Use your Questurian Payload CMS account to access this page</p>
          
          {/* Connection Status in Login */}
          <div 
            className={`login-connection-status ${isConnected ? 'connected' : 'disconnected'}`}
            title={connectionError || (isConnected ? 'Connected to Payload Server' : 'Disconnected from Payload Server')}
          >
            <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            <span className="connection-text">
              {isConnected ? 'Connected to Payload Server' : 'Payload Server Offline'}
            </span>
          </div>
          {connectionError && !isConnected && (
            <p className="connection-error-detail">{connectionError}</p>
          )}
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login">Email</label>
            <input
              id="login"
              name="login"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {errorMessage ? <p className="login-error" role="alert">{errorMessage}</p> : null}
          <button type="submit" className="button login-button" disabled={isSubmitting || !isConnected}>
            {isSubmitting ? 'Signing in...' : 'Log in'}
          </button>
          {!isConnected && (
            <p className="login-warning">
              Payload CMS server is not reachable. Please ensure the server is running at {import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'}.
              {connectionError?.includes('CORS') && (
                <>
                  <br /><br />
                  <strong>CORS Issue:</strong> The server may need to be configured to allow requests from this origin.
                </>
              )}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
