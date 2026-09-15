import { AppNav } from "@/components/AppNav";
import { AppHeader } from "@/components/AppHeader";
import { AuthControls } from "@/components/AuthControls";
import { NetworkBanner } from "@/components/NetworkBanner";
import { assertSignedIn } from "@/lib/server/identity";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await assertSignedIn();
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <a href="#main" className="absolute -top-14 left-4 z-[200] rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-[top] duration-150 focus-visible:top-3">Skip to content</a>
      <AppNav />
      <div className="flex min-h-screen flex-col pb-24 lg:ml-[276px] lg:pb-0">
        <AppHeader authControls={<AuthControls />} />
        <NetworkBanner />
        <main id="main" className="relative flex-1 overflow-hidden before:pointer-events-none before:absolute before:-right-40 before:top-20 before:size-[32rem] before:rounded-full before:bg-cyan-400/[.05] before:blur-3xl">{children}</main>
      </div>
    </div>
  );
}
