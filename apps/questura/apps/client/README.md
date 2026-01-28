# Client Auth & Stripe Starter Kit

Next.js frontend with authentication, Google OAuth, and membership system using Stripe payments. Client-side only.

<h2 style="margin-bottom: 0.5rem;">Built with:</h2>
<p>
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-007ACC?style=for-the-badge&logo=typescript&logoColor=white"/>
    <img alt="Next.js" src="https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white"/>
  <img alt="React Query" src="https://img.shields.io/badge/react_query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white"/>
  <img alt="Zustand" src="https://img.shields.io/badge/zustand-433E38?style=for-the-badge&logo=react&logoColor=white"/>
</p>

<h2 style="margin-bottom: 0.5rem;">Features:</h2>

- ✅ **Cookie-only authentication** — secure HTTP-only cookies 
- ✅ **Google OAuth integration** — sign in with Google ready to go
- ✅ **Local authentication** — email/password registration and login
- ✅ **Stripe payments** — subscription payments with webhook support
- ✅ **Account linking** — users can link multiple auth methods to one account
- ✅ **Password management** — add, change, or remove passwords
- ✅ **Protected routes** — automatic login prompts for authenticated pages
- ✅ **React Query state management** — server state with smart caching and invalidation
- ✅ **Feature-based architecture** — organized by domain (Auth, Payments, Account)
- ✅ **Type-safe** — full TypeScript support throughout

---

## Installation

### Prerequisites
- **Node.js** 18.0 or higher
- **npm** or **yarn** package manager
- A running backend API (see [Backend](#backend) section below)

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment configuration**

   Create a `.env.local` file in the root directory with the following variables:
   ```env
   # Backend API URL (where your backend server is running)
   NEXT_PUBLIC_BACKEND_URL=http://localhost:4000

   # Frontend URL (for redirects and CORS)
   NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000

   # Stripe publishable key (get from Stripe dashboard)
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

   # Backend URL for OAuth callbacks (typically same as NEXT_PUBLIC_BACKEND_URL)
   NEXT_PUBLIC_APP_URL=http://localhost:4000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API server URL | `http://localhost:4000` |
| `NEXT_PUBLIC_FRONTEND_URL` | Frontend URL for redirects and CORS | `http://localhost:3000` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable API key (get from Stripe dashboard) | `pk_test_...` |
| `NEXT_PUBLIC_APP_URL` | Backend URL for OAuth callbacks (typically same as NEXT_PUBLIC_BACKEND_URL) | `http://localhost:4000` |

### Available Scripts

```bash
npm run dev              # Start dev server with Turbopack
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Run ESLint
npm test                 # Run Jest tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate test coverage report
```

---

## Backend

This frontend was built to work with this backend starter kit:

**[Backend Starter Kit Repository](https://github.com/alantothe/auth-starter-kit)**

The backend provides cookie-based authentication, Google OAuth, and Stripe subscription management. You can use it as-is or adapt this frontend to work with your own backend API.

---

## Features

### Authentication
- Email/password registration and login
- Google OAuth sign-in
- Session-based auth with HTTP-only cookies
- Account linking (link Google to existing email account)
- Password management (add/change/remove for OAuth users)
- Protected routes with automatic login modal
- Session persistence across page refreshes

### Payments
- Stripe subscription integration
- Monthly/yearly pricing plans
- Secure payment processing with Stripe Elements
- Subscription status tracking
- Member-only content protection
- Subscription cancellation flow

### Developer Experience
- Feature-based code organization
- React Query for server state management
- Zustand for UI state
- Centralized API request helpers
- Path aliases (`@/*` imports)
- Development proxy for ngrok backends
- Type-safe throughout

---

