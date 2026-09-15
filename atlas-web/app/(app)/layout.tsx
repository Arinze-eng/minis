import { AppNav } from "@/components/AppNav";
import { AppHeader } from "@/components/AppHeader";
import { AuthControls } from "@/components/AuthControls";
import { NetworkBanner } from "@/components/NetworkBanner";
import { assertSignedIn } from "@/lib/server/identity";
import "../shell.css";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Keep the shell itself behind authentication. Pages and route handlers
  // still verify identity where they read data (Clerk: layouts do not re-run
  // on client-side navigation).
  await assertSignedIn();

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AppNav />
      <div className="app-content">
        <AppHeader authControls={<AuthControls />} />
        <NetworkBanner />
        {children}
      </div>
    </div>
  );
}
