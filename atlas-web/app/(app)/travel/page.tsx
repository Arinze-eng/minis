import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Clock, Info, MapPin, Plane, ShieldCheck } from "lucide-react";
import "../panels.css";

export const metadata: Metadata = {
  title: "Travel",
};

/**
 * Travel timeline (Operations Engine). No travel connector is configured in
 * this release, so this surface states its scope and shows one clearly labelled
 * synthetic illustration — it never presents fabricated bookings as user data
 * (product contract §7: fixtures are labelled, never disguised).
 */

const SAMPLE = {
  provider: "Sample Air",
  route: "LHR → JFK",
  departure: "2026-09-18 11:15 UTC",
  checkIn: "T-24h",
  boarding: "T-45m",
  evidence: "Synthetic illustration — no booking exists in your account.",
};

const PLANNED_BEHAVIOUR = [
  "Extract bookings from authorized messages — flight, rail, hotel, rental.",
  "Show check-in and boarding deadlines on a single timeline.",
  "Surface reminders that respect your quiet hours.",
  "Prepare the next move; never modify a booking without approval.",
];

export default function TravelPage() {
  return (
    <main id="main" className="page page-narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Plane size={14} aria-hidden="true" />
            Operations engine · travel timeline
          </p>
          <h1>Travel obligations, prepared not chased</h1>
          <p className="page-sub">
            When a travel source is connected, Atlas builds booking and boarding
            timelines from authorized evidence — with check-in and boarding
            deadlines surfaced before they pass.
          </p>
        </div>
      </div>

      <div className="stack-md">
        <div className="notice notice-warn" role="note">
          <Info size={18} aria-hidden="true" />
          <div>
            <p>
              <strong>No travel source is connected yet.</strong>
            </p>
            <p className="muted">
              This capability activates when a connector is configured and you
              grant consent on <Link href="/sources">Sources</Link>. Nothing
              below is your data.
            </p>
          </div>
        </div>

        <section className="card" aria-labelledby="connected-h">
          <div className="card-head">
            <h2 id="connected-h">
              <ShieldCheck size={15} aria-hidden="true" /> What Atlas will do when
              connected
            </h2>
            <span className="badge">Not active</span>
          </div>
          <div className="card-pad">
            <ul className="prose-list">
              {PLANNED_BEHAVIOUR.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card" aria-labelledby="shape-h">
          <div className="card-head">
            <h2 id="shape-h">Timeline shape — synthetic illustration</h2>
            <span className="badge badge-warn">Sample</span>
          </div>
          <div className="card-pad stack-md">
            <p className="sample-row">
              <Plane size={16} aria-hidden="true" />
              <span className="sample-title">{SAMPLE.provider}</span>
              <span className="muted">{SAMPLE.route}</span>
            </p>
            <div className="timeline-grid">
              <div className="timeline-cell">
                <span className="timeline-cell-label">
                  <Calendar size={13} aria-hidden="true" /> Departs
                </span>
                <span className="timeline-cell-value">{SAMPLE.departure}</span>
              </div>
              <div className="timeline-cell">
                <span className="timeline-cell-label">
                  <Clock size={13} aria-hidden="true" /> Check-in
                </span>
                <span className="timeline-cell-value">{SAMPLE.checkIn}</span>
              </div>
              <div className="timeline-cell">
                <span className="timeline-cell-label">
                  <MapPin size={13} aria-hidden="true" /> Boarding
                </span>
                <span className="timeline-cell-value">{SAMPLE.boarding}</span>
              </div>
            </div>
            <p className="sample-source">{SAMPLE.evidence}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
