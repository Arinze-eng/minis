import Link from "next/link";
import "./notfound.css";

export default function NotFound() {
  return (
    <main id="main" className="notfound">
      <h1>That waypoint does not exist</h1>
      <p>
        The signal you followed is gone, expired, or was never on this map.
      </p>
      <Link href="/inbox">Back to the Inbox</Link>
    </main>
  );
}
