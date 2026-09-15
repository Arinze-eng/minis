import type { Metadata, Viewport } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeScript } from "@/components/ThemeScript";
import { clerkProviderEnabled } from "@/lib/server/clerkIdentity";
import "./globals.css";
import "./auth.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Atlas — the quiet map of your next move",
    template: "%s · Atlas",
  },
  description:
    "Atlas notices the work you are avoiding, prepares the next move, and asks before it acts.",
  applicationName: "Atlas",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ClerkProvider mounts only when the auth provider is configured, and sits
  // INSIDE <body> per the Clerk Next.js quickstart. Unconfigured deployments
  // run in the labelled local mode and surfaces say so honestly — nothing
  // pretends a signed-in user exists.
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const withClerk = clerkProviderEnabled() && Boolean(clerkKey);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${dmSans.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        {withClerk ? <ClerkProvider>{children}</ClerkProvider> : children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
