"use client";

import { useEffect } from "react";
import "./route-error.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side logging only; never render the raw error to the page.
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="route-error">
      <h1>Atlas lost the thread</h1>
      <p>Something failed while preparing this view. Nothing was sent or changed.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
