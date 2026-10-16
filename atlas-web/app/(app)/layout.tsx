import { AppNav } from "@/components/AppNav";
import { AppHeader } from "@/components/AppHeader";
import { AuthControls } from "@/components/AuthControls";
import { NetworkBanner } from "@/components/NetworkBanner";
import { assertSignedIn } from "@/lib/server/identity";
import "../shell.css";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await assertSignedIn();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <a
        href="#main"
        className="absolute -top-14 left-4 z-[200] btn-primary focus-visible:top-2 transition-[top] duration-150"
      >
        Skip to content
      </a>

      <AppNav />

      {/* Content sits right of the desktop sidebar and above the phone tab bar */}
      <div
        className="lg:ml-[260px] flex flex-col min-h-screen pb-[calc(51px+env(safe-area-inset-bottom,0px))] lg:pb-0"
      >
        <AppHeader authControls={<AuthControls />} />
        <NetworkBanner />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
