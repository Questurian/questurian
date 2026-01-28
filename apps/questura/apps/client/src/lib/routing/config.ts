/**
 * Configuration for protected routes
 */

export interface RouteProtectionConfig {
  protectedPaths: string[];
  redirectTo: string;
  showLoginParam: string;
  redirectParam: string;
}

export const routeConfig: RouteProtectionConfig = {
  // Routes that require authentication
  protectedPaths: ['/account'],

  // Where to redirect unauthenticated users
  redirectTo: '/',

  // URL param to trigger login modal
  showLoginParam: 'showLogin',

  // URL param to store intended destination
  redirectParam: 'redirect',
};
