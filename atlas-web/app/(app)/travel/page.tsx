import type { Metadata } from "next";
import Link from "next/link";
import { Info, Plane, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Travel",
};

const PLANNED_BEHAVIOUR = [
  "Extract bookings from authorized messages — flight, rail, hotel, rental.",
  "Show check-in and boarding deadlines on a single timeline.",
  "Surface reminders that respect your quiet hours.",
  "Prepare the next move; never modify a booking without approval.",
];

export default function TravelPage() {
  return (
    <main id="main" className="max-w-[720px] mx-auto px-6 py-10 w-full">
      {/* Page header */}
      <div className="mb-8">
        <p className="inline-flex items-center gap-1.5 mb-3 text-[0.72rem] font-extrabold tracking-[0.13em] uppercase text-[var(--color-accent-deep)]">
          <Plane size={14} aria-hidden="true" />
          Operations engine · travel timeline
        </p>
        <h1 className="text-3xl font-bold tracking-[-0.015em] leading-[1.15] m-0 mb-3 text-[var(--color-ink)]">
          Travel obligations, prepared not chased
        </h1>
        <p className="m-0 text-base text-[var(--color-ink-muted)] leading-relaxed max-w-[56ch]">
          When a travel source is connected, Atlas builds booking and boarding
          timelines from authorized evidence — with check-in and boarding
          deadlines surfaced before they pass.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Notice */}
        <div
          role="note"
          className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[var(--color-alert-soft)] bg-[var(--color-alert-soft)] text-[var(--color-ink)]"
        >
          <Info
            size={18}
            aria-hidden="true"
            className="text-[var(--color-alert-deep)] mt-0.5 flex-none"
          />
          <div>
            <p className="m-0 font-semibold text-sm">
              No travel source is connected yet.
            </p>
            <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
              This capability activates when a connector is configured and you
              grant consent on{" "}
              <Link
                href="/sources"
                className="text-[var(--color-accent-deep)] underline underline-offset-2"
              >
                Sources
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Planned behaviour card */}
        <section
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl overflow-hidden"
          aria-labelledby="connected-h"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-line)]">
            <h2
              id="connected-h"
              className="m-0 text-[0.95rem] font-semibold text-[var(--color-ink)] flex items-center gap-1.5"
            >
              <ShieldCheck size={15} aria-hidden="true" />
              What Atlas will do when connected
            </h2>
            <span className="text-[0.72rem] font-bold tracking-wide uppercase px-2.5 py-1 rounded-full bg-[var(--color-line)] text-[var(--color-ink-muted)]">
              Not active
            </span>
          </div>
          <div className="px-6 py-5">
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
              {PLANNED_BEHAVIOUR.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-[0.92rem] text-[var(--color-ink-muted)] leading-relaxed"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] flex-none"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Upcoming detail card */}
        <section
          className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl overflow-hidden"
          aria-labelledby="coming-soon-h"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-line)]">
            <h2
              id="coming-soon-h"
              className="m-0 text-[0.95rem] font-semibold text-[var(--color-ink)] flex items-center gap-1.5"
            >
              <Plane size={15} aria-hidden="true" />
              Coming soon
            </h2>
            <span className="text-[0.72rem] font-bold tracking-wide uppercase px-2.5 py-1 rounded-full bg-[var(--color-alert-soft)] text-[var(--color-alert-deep)]">
              In progress
            </span>
          </div>
          <div className="px-6 py-5 flex flex-col gap-3">
            <p className="m-0 text-[0.92rem] text-[var(--color-ink)] leading-relaxed">
              The travel timeline is under development. Once a travel source is
              connected, you will see a live view of your upcoming bookings —
              flights, trains, hotels, and car rentals — with deadlines surfaced
              before they matter.
            </p>
            <p className="m-0 text-[0.88rem] text-[var(--color-ink-muted)] leading-relaxed">
              Atlas reads only. It never modifies, cancels, or rebooks anything
              without your explicit approval.
            </p>
          </div>
        </section>

        {/* CTA */}
        <div className="flex justify-center pt-2">
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-[var(--radius-control)] bg-[var(--color-accent)] text-[var(--color-on-accent)] no-underline hover:bg-[var(--color-accent-deep)] active:scale-95 transition-all duration-150"
            href="/sources"
          >
            Connect a travel source
          </Link>
        </div>
      </div>
    </main>
  );
}
