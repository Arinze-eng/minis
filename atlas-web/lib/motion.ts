"use client";

import { useEffect, useState } from "react";

/** Observe prefers-reduced-motion so spring/entrance motion can collapse. */
export function useMotionPrefs(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Shared spring (the documented drawer feel: stiffness 300, damping 30). */
export const atlasSpring = (reduced: boolean) =>
  reduced ? { duration: 0.01 } : { type: "spring" as const, stiffness: 300, damping: 30 };
