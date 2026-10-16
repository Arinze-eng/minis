import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeScript } from "@/components/ThemeScript";
import {
  clerkConfigured,
  clerkSignInFallbackRedirectUrl,
  clerkSignInUrl,
  clerkSignUpFallbackRedirectUrl,
  clerkSignUpUrl,
} from "@/lib/server/clerkIdentity";
import "./globals.css";
import "./auth.css";

export const metadata: Metadata = {
  title: {
    default: "Atlas — the quiet map of your next move",
    template: "%s · Atlas",
  },
  description:
    "Atlas notices the work you are avoiding, prepares the next move, and asks before it acts.",
  applicationName: "Atlas",
  appleWebApp: {
    capable: true,
    title: "Atlas",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // <ClerkProvider> mounts only when the auth provider is configured, and sits
  // INSIDE <body> (required in Clerk Core 3). Unconfigured deployments run in
  // the labelled local mode and surfaces say so honestly — nothing pretends a
  // signed-in user exists.
  //
  // Redirect behaviour follows the documented props/env vars: a signed-in user
  // lands on the Inbox unless Clerk's own `redirect_url` already aimed them at
  // a specific page, and signing out returns to the landing page.
  const withClerk = clerkConfigured();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {withClerk ? (
          <ClerkProvider
            signInUrl={clerkSignInUrl()}
            signUpUrl={clerkSignUpUrl()}
            signInFallbackRedirectUrl={clerkSignInFallbackRedirectUrl()}
            signUpFallbackRedirectUrl={clerkSignUpFallbackRedirectUrl()}
            afterSignOutUrl="/"
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
