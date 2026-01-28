# Client Pages & Routes

This document provides an overview of all pages in the Next.js 15 client-side authentication and payments application.

---

## Quick Reference

| Route | File | Description |
|-------|------|-------------|
| `/` | `src/app/page.tsx` | Home page with login modal |
| `/auth` | `src/app/(auth)/auth/page.tsx` | Login/signup page |
| `/auth/confirm-password-change` | `src/app/(auth)/auth/confirm-password-change/page.tsx` | Confirm password change |
| `/auth/setup-password` | `src/app/(auth)/setup-password/page.tsx` | Set password for OAuth users |
| `/auth/link-google` | `src/app/(auth)/link-google/page.tsx` | OAuth account linking popup |
| `/auth-callback` | `src/app/(auth)/auth-callback/page.tsx` | OAuth redirect handler |
| `/auth-callback-close` | `src/app/(auth)/auth-callback-close/page.tsx` | Popup close handler |
| `/auth-error` | `src/app/(auth)/auth-error/page.tsx` | Auth error display |
| `/account` | `src/app/account/page.tsx` | Account dashboard (protected) |
| `/account/change-email` | `src/app/account/change-email/page.tsx` | Email change flow (protected) |
| `/account/change-password` | `src/app/account/change-password/page.tsx` | Password change (protected) |
| `/account/add-password` | `src/app/account/add-password/page.tsx` | Add password for OAuth users (protected) |
| `/account/email-changed-success` | `src/app/account/email-changed-success/page.tsx` | Email change confirmation (protected) |
| `/account/linking-error` | `src/app/account/linking-error/page.tsx` | OAuth linking error (protected) |
| `/membership/join` | `src/app/(membership)/join/page.tsx` | Purchase page (protected) |
| `/membership/purchase/monthly` | `src/app/(membership)/purchase/monthly/page.tsx` | Monthly checkout (protected) |
| `/membership/subscription/success` | `src/app/(membership)/subscription/success/page.tsx` | Subscription confirmation (protected) |
| `/membership/subscription/cancel` | `src/app/(membership)/subscription/cancel/page.tsx` | Cancellation confirmation (protected) |

---

## Route Structure Overview

The project uses Next.js App Router with route groups for organization:

```
src/app/
├── (auth)/              # Authentication-related routes
├── (membership)/        # Subscription and payment routes
├── account/             # Protected user account routes
├── page.tsx             # Home page
├── layout.tsx           # Root layout with providers
├── error.tsx            # Global error boundary
└── not-found.tsx        # 404 page
```

---

## Public Routes

### Home Page (`/`)
**File:** `src/app/page.tsx`

- Landing page displayed to all users
- Shows login modal when unauthenticated user tries to access protected content
- Handles OAuth error query parameters and displays appropriate error messages
- Contains `useProtectedRoute()` hook to redirect to login when needed
- Displays error messages for failed OAuth attempts (account exists locally, OAuth failed, etc.)

---

## Authentication Routes (Group: `(auth)/`)

These routes are all authentication-related and grouped under the `(auth)` route group.

### Login/Signup Page (`/auth`)
**File:** `src/app/(auth)/auth/page.tsx`

- Main authentication page for login and signup flows
- Handles email/password authentication
- Google OAuth integration
- Route guards for popup windows (doesn't render full page in OAuth linking mode)

### Confirm Password Change (`/auth/confirm-password-change`)
**File:** `src/app/(auth)/auth/confirm-password-change/page.tsx`

- User enters verification code to confirm password change
- Part of multi-step password change flow
- Validates code and completes password update

### Setup Password Page (`/auth/setup-password`)
**File:** `src/app/(auth)/setup-password/page.tsx`

- Allows users with Google OAuth only to set up a local password
- Accessible from account page
- Validates password requirements (min 8 chars, 1 number, 1 uppercase, 1 symbol)

### Link Google Page (`/auth/link-google`)
**File:** `src/app/(auth)/link-google/page.tsx`

- OAuth linking flow for connecting Google to existing local account
- Popup window used during linking process
- Detects if it's a popup via multiple methods (`window.opener`, window dimensions, URL params)

### Auth Callback (`/auth-callback`)
**File:** `src/app/(auth)/auth-callback/page.tsx`

- Handles OAuth redirect from backend after Google authentication
- Parses user data from query params
- Closes popup if in linking mode
- Redirects to appropriate page based on auth success/failure

### Auth Callback Close (`/auth-callback-close`)
**File:** `src/app/(auth)/auth-callback-close/page.tsx`

- Simple page that closes the OAuth popup window after linking
- Signals success back to parent window via `postMessage`

### Auth Error Page (`/auth-error`)
**File:** `src/app/(auth)/auth-error/page.tsx`

- Dedicated error page for authentication failures
- Displays error message and reason for failure
- Provides link back to auth page or home

---

## Account Routes (Protected: `/account/*`)

**Access:** Requires authentication. Redirects to home with login modal if not authenticated.

### Account Dashboard (`/account`)
**File:** `src/app/account/page.tsx`

- Main user account management page
- Displays user information
- Shows email, password, and Google OAuth settings
- Links to sub-pages for changing email/password
- Shows membership/subscription status

### Change Email (`/account/change-email`)
**File:** `src/app/account/change-email/page.tsx`

- Dedicated page for email change flow
- Multi-step process:
  1. Verify current password
  2. Request email change (sends verification code to new email)
  3. Confirm change with verification code
- Handles OAuth unlinking when changing email

### Change Password (`/account/change-password`)
**File:** `src/app/account/change-password/page.tsx`

- Page for changing password for local authentication
- Validates old password
- Enforces password requirements on new password
- Confirms password change

### Add Password (`/account/add-password`)
**File:** `src/app/account/add-password/page.tsx`

- Available only for users with Google OAuth (no local password)
- Allows setting up a local password while maintaining Google login
- Validates password requirements

### Email Changed Success (`/account/email-changed-success`)
**File:** `src/app/account/email-changed-success/page.tsx`

- Success confirmation page after email change completes
- Shows new email address
- Provides button to return to account page or log in again

### Linking Error (`/account/linking-error`)
**File:** `src/app/account/linking-error/page.tsx`

- Dedicated error page for OAuth account linking failures
- Displays why linking failed
- Provides options to retry or go back

---

## Membership Routes (Group: `(membership)/`)

These routes handle subscription and payment flows.

### Join/Purchase Page (`/membership/join`)
**File:** `src/app/(membership)/join/page.tsx`

- Landing page for new members to purchase subscription
- Displays pricing and membership benefits
- Stripe integration for payment processing
- Redirects to login if not authenticated

### Purchase Monthly (`/membership/purchase/monthly`)
**File:** `src/app/(membership)/purchase/monthly/page.tsx`

- Checkout page for monthly subscription
- Stripe checkout integration
- Billing information collection
- Creates checkout session and redirects to Stripe

### Subscription Success (`/membership/subscription/success`)
**File:** `src/app/(membership)/subscription/success/page.tsx`

- Confirmation page after successful subscription purchase
- Shows subscription details and next steps
- Confirms membership activation

### Subscription Cancel (`/membership/subscription/cancel`)
**File:** `src/app/(membership)/subscription/cancel/page.tsx`

- Confirmation page after canceling subscription
- Shows cancellation details
- Effective date of cancellation
- Option to rejoin

---

## Special Pages

### Root Layout (`/`)
**File:** `src/app/layout.tsx`

- Wraps entire application
- Sets up providers:
  - React Query (QueryProvider)
  - Next.js metadata
- Includes global Navbar component
- Applies Tailwind CSS styling

### Not Found (404)
**File:** `src/app/not-found.tsx`

- Displays when user navigates to non-existent route
- Shows 404 error message
- Provides link back to home page
- Styled for dark mode support

### Error Boundary
**File:** `src/app/error.tsx`

- Global error boundary for unhandled errors
- Displays error message to user
- Provides recovery options

---

## Route Groups

### Auth Group `(auth)/`
Groups authentication-related routes without affecting URL structure:
- `/auth`
- `/auth/confirm-password-change`
- `/auth/setup-password`
- `/auth/link-google`
- `/auth-callback`
- `/auth-callback-close`
- `/auth-error`

### Membership Group `(membership)/`
Groups subscription/payment routes:
- `/membership/join`
- `/membership/purchase/monthly`
- `/membership/subscription/success`
- `/membership/subscription/cancel`

### Account Routes
Protected account management routes:
- `/account`
- `/account/change-email`
- `/account/change-password`
- `/account/add-password`
- `/account/email-changed-success`
- `/account/linking-error`

---

## Authentication Flow

### Login/Signup Flow
```
Home (/)
  → Click Login
  → Auth Page (/auth)
  → Submit credentials
  → Home (/) or Account (/account)
```

### OAuth Flow
```
Auth Page (/auth)
  → Google OAuth
  → OAuth Callback (/auth-callback)
  → Home (/) or Account (/account)
```

### Account Linking Flow
```
Account Page (/account)
  → Click "Link Google"
  → Popup opens (Link Google /auth/link-google)
  → Google OAuth in popup
  → OAuth Callback closes popup
  → Parent refreshes user data
```

### Email Change Flow
```
Account Page (/account)
  → Change Email (/account/change-email)
  → Verify password
  → Enter new email
  → Enter verification code
  → Email Changed Success (/account/email-changed-success)
```

### Password Setup/Change
```
Account Page (/account)
  → Add Password (/account/add-password) OR Change Password (/account/change-password)
  → Enter password details
  → Confirmation
```

---

## Protected Routes

The following routes require authentication and will redirect to home with login modal if accessed without being authenticated:

- `/account` (all sub-routes)
- `/membership/join`
- `/membership/purchase/monthly`
- `/membership/subscription/success`
- `/membership/subscription/cancel`

**Protection Logic:** Implemented via `useProtectedRoute()` hook in components or at page level.

---

## Environment & Configuration

All routes respect the following configuration from `src/lib/routing/config.ts`:

```typescript
protectedPaths: ['/account', '/membership/...']
redirectTo: '/'                    // Where to redirect if not authenticated
showLoginParam: 'showLogin'        // URL param to show login modal
redirectParam: 'redirect'          // URL param for post-login redirect
```

---

## Summary Table

| Route | Type | Auth Required | Purpose |
|-------|------|---------------|---------|
| `/` | Public | No | Home page, login modal trigger |
| `/auth` | Public | No | Login/signup form |
| `/auth/confirm-password-change` | Public | No | Confirm password change |
| `/auth/setup-password` | Public | No | Set password for OAuth users |
| `/auth/link-google` | Public | No | OAuth account linking popup |
| `/auth-callback` | Public | No | OAuth redirect handler |
| `/auth-callback-close` | Public | No | Popup close handler |
| `/auth-error` | Public | No | Auth error display |
| `/account` | Protected | Yes | Account dashboard |
| `/account/change-email` | Protected | Yes | Email change flow |
| `/account/change-password` | Protected | Yes | Password change |
| `/account/add-password` | Protected | Yes | Add password (OAuth users) |
| `/account/email-changed-success` | Protected | Yes | Confirmation page |
| `/account/linking-error` | Protected | Yes | Linking error display |
| `/membership/join` | Protected | Yes | Purchase page |
| `/membership/purchase/monthly` | Protected | Yes | Monthly checkout |
| `/membership/subscription/success` | Protected | Yes | Subscription confirmation |
| `/membership/subscription/cancel` | Protected | Yes | Cancellation confirmation |
| `*` | Special | No | 404 page |
