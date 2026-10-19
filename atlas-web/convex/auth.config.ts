import type { AuthConfig } from "convex/server";

/**
 * Read by the Convex CLI at push time.
 * - Clerk (production): set CLERK_JWT_ISSUER_DOMAIN and create a Clerk JWT template named "convex".
 * - Local development only: set ATLAS_DEV_JWT_ISSUER to the Next.js dev issuer
 *   (e.g. http://localhost:3100/api/dev-auth). Never set it on a production deployment.
 */
const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;
const devIssuer = process.env.ATLAS_DEV_JWT_ISSUER;

export default {
  providers: [
    ...(clerkDomain ? [{ domain: clerkDomain, applicationID: "convex" }] : []),
    ...(devIssuer
      ? [{ type: "customJwt" as const, applicationID: "convex", issuer: devIssuer, jwks: `${devIssuer}/jwks`, algorithm: "RS256" as const }]
      : []),
  ],
} satisfies AuthConfig;
