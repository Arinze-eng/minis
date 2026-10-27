import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeScript } from "@/components/ThemeScript";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import {
  clerkConfigured,
  clerkPublishableKey,
  clerkSignInFallbackRedirectUrl,
  clerkSignInUrl,
  clerkSignUpFallbackRedirectUrl,
  clerkSignUpUrl,
} from "@/lib/server/clerkIdentity";
import "./globals.css";
import "./ui-fixes.css";
import "./auth.css";
import "./studio.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

// Clerk credentials are supplied by the runtime in production. Do not let
// Next.js prerender this layout during the image build, when Render's runtime
// environment variables are not available yet.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Atlas — your wardrobe, styled",
    template: "%s · Atlas",
  },
  description:
    "Your wardrobe, styled. Atlas catalogues your clothes from photos, builds outfits for the weather, packs your trips and watches your subscriptions.",
  applicationName: "Atlas",
  appleWebApp: {
    capable: true,
    title: "Atlas",
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body>
        {withClerk ? (
          <ClerkProvider
            publishableKey={clerkPublishableKey()}
            signInUrl={clerkSignInUrl()}
            signUpUrl={clerkSignUpUrl()}
            signInFallbackRedirectUrl={clerkSignInFallbackRedirectUrl()}
            signUpFallbackRedirectUrl={clerkSignUpFallbackRedirectUrl()}
            afterSignOutUrl="/"
          >
            <ConvexClientProvider clerk>{children}</ConvexClientProvider>
          </ClerkProvider>
        ) : (
          <ConvexClientProvider clerk={false}>{children}</ConvexClientProvider>
        )}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
