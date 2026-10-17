/**
 * Read by the Convex CLI at push time. Requires a Clerk JWT template named `convex` and
 * CLERK_JWT_ISSUER_DOMAIN set on the deployment (`npx convex env set CLERK_JWT_ISSUER_DOMAIN ...`).
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
