import type { Metadata } from "next";
import { PrivacyControls } from "./PrivacyControls";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Privacy & data",
};

export default function PrivacyPage() {
  return (
    <main id="main" className="privacy-page">
      <h1>Privacy &amp; data</h1>
      <p className="privacy-sub">
        Every control here is yours. In the connected flow each action is
        enforced server-side, logged in the audit trail, and confirmed before
        it runs.
      </p>

      <PrivacyControls />

      <section className="privacy-notes" aria-labelledby="notes-h">
        <h2 id="notes-h">What deletion covers</h2>
        <ul>
          <li>Wardrobe assets and garment metadata, including confirmed tags and correction history.</li>
          <li>Generated previews and any reference assets, per their retention policy.</li>
          <li>Evidence records, subscription findings, pending jobs, cached drafts, and search indexes.</li>
          <li>Stored OAuth tokens — disconnect revokes provider access first, then deletes the tokens.</li>
        </ul>
        <p>
          Export produces a machine-readable copy of your records before
          anything is deleted. Deletion is irreversible once confirmed; some
          operations include a short undo window instead of a prompt.
        </p>
      </section>
    </main>
  );
}
