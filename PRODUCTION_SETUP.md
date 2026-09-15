# Atlas production setup

This runbook describes the deployment of the Next.js application in `atlas-web/` to Render or another Node.js host. The application currently serves both the browser UI and the authenticated `/api/*` routes from the same Next.js service. A separately hosted frontend is possible only if it uses the same-origin API host correctly and the authentication/origin allowlists are configured; do not expose server secrets to that frontend.

## Why the current deployment returns 503

The live deployment returns `503 Authentication is not configured.` because production middleware intentionally fails closed unless both Clerk variables are present:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
```

This is expected security behavior, not a UI bug. Set the variables in Render and redeploy.

## Authentication flow (Clerk Core 3)

`@clerk/nextjs` v7 is Clerk Core 3. Identity follows the current Clerk guidance:

- **Clerk is the only identity authority.** `middleware.ts` bootstraps the request
  and `clerkMiddleware()` verifies the session; then every page, layout and Route
  Handler that reads data resolves identity with `auth()`
  (`lib/server/identity.ts`). The legacy `atlas_session` cookie is no longer
  minted on clerk deployments — middleware clears it if it exists, so a
  signed-out browser cannot carry a stale identity forward.
- **Protection is resource-based.** `createRouteMatcher()` is deprecated in Core 3
  and is not used. The `(app)` shell calls `assertSignedIn()` (an addition, not a
  replacement), pages call `principalFromCookies()`, and Route Handlers call
  `requirePrincipal()`. Middleware additionally answers `401` for Atlas API routes
  when the request is unauthenticated.
- **Component vocabulary.** `<SignedIn>`, `<SignedOut>` and `<Protect>` were
  removed in Core 3 and now throw at render; `<Show when="signed-in">` /
  `<Show when="signed-out">` replaces them (`components/AuthControls.tsx`).
  `tests/authContract.test.ts` fails the build if a removed component, the
  deprecated matcher, or a removed redirect prop reappears.
- **Redirects.** `fallbackRedirectUrl` (not `forceRedirectUrl`) is used so a
  user bounced from a protected page lands back on that page after signing in.
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` and the
  corresponding `*_FALLBACK_REDIRECT_URL` variables are the documented
  configuration point.
- **Signed-in vs signed-out is always visible.** The header shows “Signed in”
  with the Clerk user menu, “Not signed in” with sign-in / create-account
  actions, or a labelled “Local dev mode · no account” chip when Clerk is not
  configured. Nothing simulates an account.

Local development without Clerk still works through the labelled local
single-principal mode. Production fails closed with `503 Authentication is not
configured.` until both Clerk keys are present.

## Environment variable matrix

### Public/client-visible variables

| Variable | Required | Value | Exposure |
|---|---:|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk `pk_live_...` key for production | Safe for browser; never use the secret key here |
| `ATLAS_PUBLIC_ORIGIN` | Yes | Canonical browser origin, e.g. `https://minis-1.onrender.com` | Used by server middleware; comma-separated origins are supported for controlled split hosting |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Recommended | `/sign-in` | Keeps Clerk’s redirects on the app’s own routes |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Recommended | `/sign-up` | Same, for sign-up |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Recommended | `/inbox` | Where to land after sign-in when Clerk has no `redirect_url` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Recommended | `/inbox` | Same, after sign-up |

The publishable key is intentionally public. Clerk documents that development keys begin with `pk_test_` and production keys with `pk_live_`; use the production key in Render.

### Server-only required variables

| Variable | Required | Purpose |
|---|---:|---|
| `CLERK_SECRET_KEY` | Yes | Server-side Clerk verification/API access; use `sk_live_...` |
| `ATLAS_SESSION_SECRET` | Yes | HMAC signing of the Atlas session cookie; generate a long random value |
| `DATABASE_URL` | Yes | PostgreSQL system of record; use TLS, normally `sslmode=require` |
| `ENCRYPTION_KEY` | Yes if Gmail is enabled | Encrypts stored Gmail refresh tokens with AES-256-GCM |
| `ENCRYPTION_KEY_PREVIOUS` | No | Temporary previous key during controlled key rotation |

Never put these variables in client code, `NEXT_PUBLIC_*`, Git, Docker build arguments, or a public `.env` file.

### Cloudinary server-only variables

| Variable | Required | Purpose |
|---|---:|---|
| `CLOUDINARY_CLOUD_NAME` | For wardrobe uploads | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | For wardrobe uploads | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | For wardrobe uploads | Cloudinary API secret; never expose it |

Atlas uses server-side signed private uploads and opaque asset IDs. The Cloudinary API secret must remain server-only. Cloudinary’s official Node integration supports either `CLOUDINARY_URL` or explicit `cloud_name`, `api_key`, and `api_secret`; this codebase uses the explicit variables above.

### Optional Gmail variables

| Variable | Required | Purpose |
|---|---:|---|
| `GOOGLE_CLIENT_ID` | For Gmail | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Gmail | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | For Gmail | Exact callback URL, e.g. `https://minis-1.onrender.com/api/gmail/callback`; preferred in production |

The Gmail integration is read-only and requires `ENCRYPTION_KEY`. Register the exact redirect URI in Google Cloud Console. Do not enable Gmail until the consent copy, OAuth scopes, redirect URI, and token encryption have been reviewed.

## Render setup

1. Open the Render service created from `render.yaml`.
2. In **Environment**, add the values as secret environment variables. Render supports bulk import from a `.env` file, but do not commit that file.
3. Set:

```text
NODE_ENV=production
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
ATLAS_SESSION_SECRET=<random 32+ byte secret>
ATLAS_PUBLIC_ORIGIN=https://minis-1.onrender.com
DATABASE_URL=postgresql://...?...sslmode=require
ENCRYPTION_KEY=<random 32+ byte secret>
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

4. If Gmail is enabled, also set the three `GOOGLE_*` variables.
5. If Gmail is enabled, set `GOOGLE_REDIRECT_URI` to the exact public callback URL, for example `https://minis-1.onrender.com/api/gmail/callback`. Atlas uses this explicit value before request-derived origins, preventing Render's internal `localhost:10000` origin from being sent to Google.
6. Save with **Save, rebuild, and deploy**. Render notes that saving without redeploying does not make the new variables available to the running process.
6. Confirm the deployment health check is `/` and that the service listens on Render’s injected `PORT`; do not hard-code a public port.

## Clerk production setup

1. Create or select a **Clerk production instance**; do not use development keys in production.
2. Copy the production `pk_live_...` publishable key and `sk_live_...` secret key to Render.
3. Add the exact production origin to Clerk’s allowed origins / instance configuration:

```text
https://minis-1.onrender.com
```

4. If using a custom domain, add that exact origin too and set `ATLAS_PUBLIC_ORIGIN` to the canonical origin. If multiple controlled origins must be supported, use a comma-separated value.
5. Configure Clerk sign-in and sign-up URLs to `/sign-in` and `/sign-up` if custom paths are used.
6. Configure production OAuth credentials for any social providers; Clerk’s shared development OAuth credentials are not production credentials.
7. Configure Clerk DNS/certificates if using a custom domain.
8. Keep the authorized-party allowlist narrow. Do not use `*`.

## Cloudinary setup

1. Create or select a Cloudinary production environment.
2. Copy the cloud name, API key, and API secret from Cloudinary’s API Keys page.
3. Set the three `CLOUDINARY_*` variables only on the server.
4. Keep the product environment private and use signed delivery for private assets.
5. Verify upload, display, delete, and failed-provider behavior after deployment.

## Local development

```bash
cd atlas-web
cp .env.example .env.local
# Keep pk_test_/sk_test_ values for development.
npm ci
npm run dev
```

`npm ci` must be run from `atlas-web/`. If it fails with “can only install
packages when your package.json and package-lock.json are in sync”, run
`npm install` once and commit the regenerated `package-lock.json` — the
Dockerfile builds with `npm ci`, so an out-of-sync lock file breaks the image
build.

For local development without PostgreSQL or Clerk, omit production-only values and use the explicitly labelled local single-principal mode. To exercise the real production path locally, provide a disposable PostgreSQL database and Clerk development keys. Never point local tests at production data.

Run the release checks:

```bash
npm run typecheck
npm test
npm run build
npm run start
```

## Split frontend hosting

The current app is a single Next.js deployment. If the browser UI is moved to Vercel or another frontend host:

- Keep the authenticated API and server-only code on the Next.js/Render service unless a deliberate API extraction is performed.
- Expose only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the separate frontend.
- Add the frontend origin to `ATLAS_PUBLIC_ORIGIN` and Clerk’s allowed origins.
- Configure the frontend to call the API over HTTPS with credentials included where required.
- Configure CORS and CSRF protections before allowing cross-origin mutation requests.
- Never expose `CLERK_SECRET_KEY`, `DATABASE_URL`, `ATLAS_SESSION_SECRET`, `ENCRYPTION_KEY`, Cloudinary API secret, or Google client secret.
- Do not treat a separate static frontend as a substitute for the authenticated Next.js API runtime.

## Production smoke test

After deployment:

1. `GET /` returns `200` rather than `503`.
2. Sign in and sign up work with the Clerk production instance.
3. `/inbox` shows the verified account mode; the header shows “Signed in” with the
   Clerk user menu, and signing out flips it to “Not signed in”.
4. Requests to `/api/*` without a Clerk session return `401
   {"error":"unauthenticated"}`, and a signed-out visit to `/inbox` (or any other
   shell route) redirects to `/sign-in`.
5. Wardrobe upload returns an explicit provider error if Cloudinary is unavailable; it must never show fake success.
6. Privacy export/delete behavior is tested with a disposable account.
7. Gmail remains disconnected until Google credentials, consent, encryption, and redirect URI are configured.
8. Browser, API, and Render logs contain no secrets or provider tokens.

## Official references

- [Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Clerk environment variables](https://clerk.com/docs/guides/development/clerk-environment-variables)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
- [Cloudinary Node integration](https://cloudinary.com/documentation/node_integration)
