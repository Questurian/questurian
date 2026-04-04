# Questura Server

Payload CMS + Next.js backend with authentication (JWT + Google OAuth), Stripe subscription management, Resend transactional emails, and Bunny.net CDN integration.

## Quick Start

```bash
# Install dependencies (pnpm required)
pnpm install

# Start development server (port 4000)
pnpm dev

# Start fresh (clears Next.js cache)
pnpm devsafe
```

Server runs on `http://localhost:4000` with admin panel at `/admin`.

## Development Commands

### Core Commands
```bash
pnpm dev                    # Start dev server
pnpm devsafe                # Fresh start, clears .next cache
pnpm build                  # Build for production
pnpm start                  # Start production server
pnpm lint                   # Run ESLint
pnpm test                   # Run integration tests (Vitest)
pnpm generate:types         # Generate TypeScript types from Payload collections
pnpm generate:importmap     # Generate Payload import map
pnpm clear:payload:except-users # Delete all Payload data except users
```

### Payload Reset (Keep Users)
```bash
# Deletes all Payload collections except "users"
pnpm clear:payload:except-users

# Preview only (no deletions)
pnpm clear:payload:except-users -- --dry-run
```

### Running Tests
```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- --run src/features/auth/__tests__/forgot-password.test.ts

# Watch mode
pnpm test -- --watch
```

Test location pattern: `src/**/__tests__/*.test.ts` (currently runs tests in `src/shared/lib/*.test.ts`)

## Architecture

### Stack
- **Framework**: Next.js 15 + Payload CMS 3.64
- **Database**: PostgreSQL with connection pooling (min=2, max=20)
- **Authentication**: JWT tokens (7-day expiration) in HTTP-only cookies + Google OAuth
- **Payments**: Stripe subscriptions with webhooks
- **Email**: Resend transactional emails
- **File Storage**: Bunny.net CDN with `@seshuk/payload-storage-bunny` plugin
- **Testing**: Vitest with jsdom, mocked `next/headers`

### Directory Structure
```
src/
├── app/                      # Next.js App Router
│   └── api/                 # API routes (auth, payments, webhooks)
├── features/                # Feature-based modules
│   ├── articles/            # Articles collection
│   ├── auth/                # Authentication & OAuth
│   │   ├── collections/     # Users collection definition
│   │   ├── lib/             # Auth utilities
│   │   ├── routes/          # Signup, login, password reset handlers
│   │   └── types/           # JWT payload types
│   ├── payments/            # Stripe integration
│   │   ├── lib/             # Stripe API helpers
│   │   ├── routes/          # Checkout, portal, subscription routes
│   │   └── webhooks/        # Stripe event handlers
│   ├── media/               # Bunny.net CDN & file uploads
│   │   ├── collections/     # MediaAsset collection
│   │   └── lib/             # CDN utilities
│   ├── emails/              # Resend transactional emails
│   │   └── templates/       # Email HTML templates
│   └── admin/               # Admin panel configuration
├── shared/                  # Shared code across features
│   ├── config/              # APP_CONFIG, APP_URLS, environment setup
│   ├── lib/                 # Utilities (auth checks, error handling, etc.)
│   ├── types/               # Global TypeScript types
│   └── utils/               # Helper functions
├── middleware.ts            # Next.js middleware (protects /admin routes)
├── payload.config.ts        # Payload CMS configuration
└── test-utils.ts            # Testing utilities
```

## Collections

**Users** - User profiles with complex auth schema
- Email/password authentication
- Google OAuth integration
- Subscription status tracking
- Role-based access control (admin, editor, user)
- Token versioning for session invalidation

**MediaAsset** - File uploads managed by Bunny.net CDN
- Automatic upload via `@seshuk/payload-storage-bunny` plugin
- Organized by content type (user-avatars/, articles/, etc.)

**Articles** - Content with media integration
- Rich text editing via Lexical editor
- Featured image support via Bunny.net

## Key Patterns

### Authentication Flow
1. User signup/login at `/api/auth/signup` or Google OAuth
2. Backend creates JWT with `userId`, `email`, `role`, `tokenVersion`
3. JWT stored in HTTP-only cookie `payload-token`
4. Token validated on every request via middleware
5. Password change increments `tokenVersion` → invalidates old tokens

See `/src/features/auth/` for implementation details.

### Stripe Payments
1. User initiates subscription → POST `/api/payments/create-checkout-session`
2. Redirected to Stripe Hosted Checkout
3. After payment → Stripe webhook hits `/api/payments/webhooks/stripe`
4. Webhook updates `subscription_status` and renewal date in database
5. Use `isActiveMember()` utility in `/src/shared/lib/` for access control

Webhook events: `customer.subscription.updated`, `customer.subscription.deleted`

See `/src/features/payments/` for implementation details.

### Bunny.net CDN
- **Plugin**: `@seshuk/payload-storage-bunny` handles automated uploads
- **Image Variants**: Dynamically transformed via URL parameters
  - `?width=1920&aspect_ratio=16:9` - Large hero images
  - `?width=720&aspect_ratio=9:16` - Portrait/mobile
  - `?width=600&aspect_ratio=1:1` - Square social media
  - `?width=300` - Thumbnail
  - `?width=150` - Avatar/small
- **Storage**: Organized by content type (`media/`, `articles/`, `user-avatars/`, etc.)

See `/docs/BUNNY_IMAGE_VARIANTS.md` for complete image transformation specs.

### Admin Panel Access
- Protected by middleware at `/src/middleware.ts`
- Only `admin` and `editor` roles can access
- Field-level permissions restrict view/edit capabilities
- See `/docs/ACCESS_CONTROL.md` and `/docs/FIELD_VISIBILITY_MATRIX.md`

### Error Handling Patterns
- **Auth errors**: Return `401 Unauthorized` with specific message
- **Payment errors**: Log to database, return user-friendly message
- **CDN errors**: Retry with exponential backoff before failing
- Always validate at system boundaries (user input, external APIs)

## Environment Setup

Create `.env.local` in the server root:

```env
# Database (PostgreSQL)
DATABASE_URI=postgresql://user:pass@localhost:5432/questura

# Authentication
JWT_SECRET=<random_32+_char_string>
PAYLOAD_SECRET=<random_32+_char_string>

# Google OAuth
GOOGLE_CLIENT_ID=<from_console.cloud.google.com>
GOOGLE_CLIENT_SECRET=<from_console.cloud.google.com>
OAUTH_REDIRECT_URL=http://localhost:4000/api/auth/google/callback

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Resend)
RESEND_API_KEY=re_...

# Bunny.net CDN
BUNNY_STORAGE_API_KEY=<your_api_key>
BUNNY_STORAGE_HOSTNAME=ny.storage.bunnycdn.com
BUNNY_STORAGE_ZONE_NAME=questurian

# Frontend
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

PostgreSQL must already be running on the configured host and port before `pnpm dev` starts. Payload can create the target database and push schema changes once it can reach a Postgres server, but it will exit immediately if nothing is listening at `DATABASE_URI`.

## Path Aliases

Use these for clean imports:
- `@/*` → `./src/`
- `@/features/*` → `./src/features/`
- `@/shared/*` → `./src/shared/`
- `@/auth/*` → `./src/features/auth/`
- `@/payments/*` → `./src/features/payments/`
- `@/media/*` → `./src/features/media/`
- `@/emails/*` → `./src/features/emails/*`

## Testing

### Vitest Configuration
- **Environment**: jsdom
- **Mock**: Next.js `headers()` automatically mocked via `/src/__mocks__/next/headers.ts`
- **Reporters**: Dot format
- **Include pattern**: `src/shared/lib/*.test.ts` (currently configured scope)

### Test Utilities
- Common setup functions available in `/src/test-utils.ts`
- Use for mocking Next.js headers, auth context, etc.

### Running Tests
```bash
# All tests
pnpm test

# Watch mode
pnpm test -- --watch

# Specific file
pnpm test -- --run src/features/auth/__tests__/forgot-password.test.ts
```

## Deployment

### Pre-Deployment Checklist
1. Run `pnpm generate:types` to regenerate Payload types from collections
2. Run `pnpm build` to compile and verify no errors
3. Run `pnpm test` to ensure tests pass
4. Run `pnpm lint` to check for code issues
5. Set all env vars in production environment

### Database
- Requires PostgreSQL (Neon recommended for serverless)
- Payload handles schema creation/updates automatically (`push: true` in config)
- Connection pooling configured: min=2, max=20 connections

### Deployment Targets
- Vercel, AWS Lambda, Docker, or traditional Node.js server
- No `.next` folder should be in version control
- All env vars available at runtime

## Important Notes

- **pnpm only**: This project uses pnpm with `legacy-peer-deps=true`. npm will fail.
- **Node version**: Requires 18.20.2+ or 20.9.0+
- **Stripe test mode**: Always use `pk_test_` and `sk_test_` keys in development
- **Bunny.net**: Uses official `@seshuk/payload-storage-bunny` plugin
- **TypeScript**: Strict mode enabled throughout

## Debugging

**Port 4000 Already in Use**
```bash
pnpm devsafe  # Clears .next cache and restarts
# Or manually kill process
lsof -i :4000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

**Payload Types Out of Date**
```bash
pnpm generate:types  # Regenerate from collections
```

**Postgres Connection Refused**
- Check that `DATABASE_URI` points to a reachable Postgres server
- Start PostgreSQL before running `pnpm dev`
- If you are using a fresh local server, create the role/database from the URI or update the URI to match an existing role/database

**Authentication Issues**
- Check `.env.local` has `JWT_SECRET` or `PAYLOAD_SECRET`
- Verify token is in cookie: `payload-token`
- Check middleware is not blocking the route
- Verify `tokenVersion` in database matches token payload

**Stripe Webhook Not Triggering (Local Development)**
```bash
# Install Stripe CLI, then:
stripe listen --forward-to localhost:4000/api/payments/webhooks/stripe
```
- Ensure `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard signing secret

**Google OAuth Issues**
- Ensure `OAUTH_REDIRECT_URL` matches Authorized redirect URI in Google Console
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- For local dev with ngrok: Update `OAUTH_REDIRECT_URL` to ngrok URL

## Additional Documentation

- **Access Control** (`docs/ACCESS_CONTROL.md`) - Role-based field visibility
- **Bunny.net CDN** (`docs/BUNNY_IMAGE_VARIANTS.md`) - Image transformation specs
- **Field Visibility** (`docs/FIELD_VISIBILITY_MATRIX.md`) - Complete field-level access control
- **API URLs** (`docs/urls.md`) - Complete REST API endpoint reference
- **Monorepo Guide** (`../CLAUDE.md`) - Full-stack architecture and client documentation
