import Link from "next/link";
import "./landing.css";
import { RouteMark } from "@/components/RouteMark";

const FOUR_QUESTIONS = [
  {
    q: "What did Atlas notice?",
    a: "A renewal date approaching, a price that changed, a garment waiting for confirmation.",
  },
  {
    q: "What evidence supports it?",
    a: "Every card carries its sources, retrieval time, and freshness — inspectable, not vibes.",
  },
  {
    q: "Why does it matter now?",
    a: "Signals arrive when the timing does: urgency comes from dates, not from alarms.",
  },
  {
    q: "What is the smallest next move?",
    a: "One prepared action per card. Atlas readies it; you decide; nothing moves without you.",
  },
];

const BOUNDARIES = [
  "Atlas can advise and prepare. It cannot purchase, cancel, or send without your explicit approval.",
  "Wardrobe images are private by default and never leave your control without a purpose you accept.",
  "Email access is read-only and scope-limited to receipts and subscriptions — never send or delete.",
];

export default function LandingPage() {
  return (
    <main id="main">
      <section className="hero">
        <div className="hero-mark">
          <RouteMark size={56} />
        </div>
        <h1>
          Atlas notices the work you are avoiding,
          <br />
          prepares the next move, and asks before it acts.
        </h1>
        <p className="hero-sub">
          A calm personal operations system for what you own, what you pay for,
          and what deserves your attention next.
        </p>
        <div className="hero-cta">
          <Link className="btn-primary" href="/inbox">
            Enter Atlas in demo mode
          </Link>
          <span className="cta-note">
            Synthetic data, clearly labelled. No account needed to look around.
          </span>
        </div>
      </section>

      <section className="questions" aria-labelledby="questions-heading">
        <h2 id="questions-heading">Every signal answers four questions</h2>
        <ol className="question-grid">
          {FOUR_QUESTIONS.map((item) => (
            <li key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="boundaries" aria-labelledby="boundaries-heading">
        <h2 id="boundaries-heading">Where Atlas stops</h2>
        <ul>
          {BOUNDARIES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="boundaries-note">
          Deterministic policy enforces these boundaries in server code — not
          prompts, not promises.
        </p>
      </section>
    </main>
  );
}
