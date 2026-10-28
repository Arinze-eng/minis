const PROVIDERS = ["gmail", "google_tasks"] as const;
export type OAuthProvider = (typeof PROVIDERS)[number];
export const isOAuthProvider = (value: string): value is OAuthProvider => (PROVIDERS as readonly string[]).includes(value);
