import type { Metadata } from "next";
import { RouteMark } from "@/components/RouteMark";
import { Plane, Calendar, Clock, MapPin, Shield, Info } from "lucide-react";

export const metadata: Metadata = {
  title: "Travel",
};

/**
 * Travel timeline (Operations Engine). No travel connector is configured in
 * this release, so this surface states its scope and shows one clearly
 * labelled synthetic illustration — it never presents fabricated bookings as
 * user data (product contract §7: fixtures are labelled, never disguised).
 */

const SAMPLE = {
  provider: "Sample Air",
  route: "LHR → JFK",
  departure: "2026-09-18 11:15 UTC",
  checkIn: "T-24h",
  boarding: "T-45m",
  evidence: "Synthetic illustration — no booking exists in your account.",
};

export default function TravelPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--atlas-lilac)]">
          <RouteMark className="w-4 h-4" />
          <span>Operations Engine · Travel Timeline</span>
        </div>
        <h1 className="text-3xl font-display font-semibold tracking-tight text-[var(--atlas-ink)]">
          Travel obligations, prepared not chased
        </h1>
        <p className="text-sm text-[var(--atlas-ink)]/70 max-w-xl">
          When a travel source is connected, Atlas builds booking and boarding
          timelines from authorized evidence — with check-in and boarding
          deadlines surfaced before they pass.
        </p>
      </div>

      <div className="border border-[var(--atlas-amber)]/40 bg-[var(--atlas-amber)]/10 rounded-xl p-5 flex gap-3" role="note">
        <Info className="w-5 h-5 text-[var(--atlas-amber)] shrink-0" />
        <div>
          <p className="text-sm font-medium text-[var(--atlas-ink)]">No travel source is connected yet.</p>
          <p className="text-xs text-[var(--atlas-ink)]/70 mt-1">
            This capability activates when a connector is configured and you
            grant consent. Nothing below is your data.
          </p>
        </div>
      </div>

      <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-[var(--atlas-ink)]/60">
          <Shield className="w-4 h-4 text-[var(--atlas-lime)]" />
          What Atlas will do when connected
        </div>
        <ul className="text-sm text-[var(--atlas-ink)]/80 space-y-2 list-disc list-inside">
          <li>Extract bookings from authorized messages — flight, rail, hotel, rental.</li>
          <li>Show check-in and boarding deadlines on a single timeline.</li>
          <li>Surface reminders that respect your quiet hours.</li>
          <li>Prepare the next move; never modify a booking without approval.</li>
        </ul>
      </div>

      <div className="bg-[var(--atlas-paper)] border border-[var(--atlas-line)] rounded-xl p-6 space-y-4" aria-hidden="true">
        <div className="flex items-center justify-between border-b border-[var(--atlas-line)] pb-3">
          <h2 className="text-sm font-display font-semibold text-[var(--atlas-ink)]">
            Timeline shape — synthetic illustration
          </h2>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[var(--atlas-amber)]/15 text-[var(--atlas-ink)] font-semibold">
            sample
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--atlas-ink)]">
          <Plane className="w-4 h-4 text-[var(--atlas-lilac)]" />
          <span className="font-medium">{SAMPLE.provider}</span>
          <span className="text-[var(--atlas-ink)]/60">{SAMPLE.route}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-background border border-[var(--atlas-line)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[var(--atlas-ink)]/60"><Calendar className="w-3.5 h-3.5" /> Departs</div>
            <div className="mt-1 font-medium text-[var(--atlas-ink)] tabular-nums">{SAMPLE.departure}</div>
          </div>
          <div className="bg-background border border-[var(--atlas-line)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[var(--atlas-ink)]/60"><Clock className="w-3.5 h-3.5" /> Check-in</div>
            <div className="mt-1 font-medium text-[var(--atlas-ink)] tabular-nums">{SAMPLE.checkIn}</div>
          </div>
          <div className="bg-background border border-[var(--atlas-line)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[var(--atlas-ink)]/60"><MapPin className="w-3.5 h-3.5" /> Boarding</div>
            <div className="mt-1 font-medium text-[var(--atlas-ink)] tabular-nums">{SAMPLE.boarding}</div>
          </div>
        </div>
        <p className="text-[11px] font-mono text-[var(--atlas-ink)]/50">{SAMPLE.evidence}</p>
      </div>
    </div>
  );
}
