import { AuthControls } from "@/components/AuthControls";
import { NetworkBanner } from "@/components/NetworkBanner";
import { OnboardingGate } from "@/components/OnboardingGate";
import { StylistProvider } from "@/components/StylistPanel";
import { Topbar } from "@/components/Topbar";
import { RequireUser, Toaster } from "@/components/ui";
import { assertSignedIn } from "@/lib/server/identity";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await assertSignedIn();

  return (
    <div className="studio">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <RequireUser>
        <OnboardingGate>
          <StylistProvider>
            <Topbar account={<AuthControls />} />
            <NetworkBanner />
            <main id="main" className="studio-main">
              {children}
            </main>
          </StylistProvider>
        </OnboardingGate>
      </RequireUser>
      <Toaster />
    </div>
  );
}
