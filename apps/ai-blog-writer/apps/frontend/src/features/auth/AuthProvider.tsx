import { AuthContext } from './auth-context';
import { useAuthSessionState } from './useAuthSessionState';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthSessionState();

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
