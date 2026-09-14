import { AppNav } from "@/components/AppNav";
import { AppHeader } from "@/components/AppHeader";
import { NetworkBanner } from "@/components/NetworkBanner";
import { clerkConfigured } from "@/lib/server/clerkIdentity";
import "../shell.css";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AppNav />
      <div className="app-content">
        <AppHeader clerkEnabled={clerkConfigured()} />
        <NetworkBanner />
        {children}
      </div>
    </div>
  );
}
