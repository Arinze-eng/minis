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
        className="absolute -top-14 left-4 z-[200] bg-[var(--color-accent)] text-white
                   px-4 py-2 rounded-lg font-semibold text-sm focus-visible:top-2
                   transition-[top] duration-150 no-underline"
      >
        Skip to content
      </a>

      <AppNav />

      {/* Content area — shifted right on desktop for sidebar */}
      <div className="lg:ml-[260px] flex flex-col min-h-screen pb-[72px] lg:pb-0">
        <AppHeader authControls={<AuthControls />} />
        <NetworkBanner />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
