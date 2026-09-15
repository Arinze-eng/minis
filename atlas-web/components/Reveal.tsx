"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { atlasSpring, useMotionPrefs } from "@/lib/motion";

/**
 * Scroll-reveal wrapper for Server Component pages: the RSC renders static
 * content; this isolated client leaf animates it into view. Reduced-motion
 * renders immediately with no transform.
 */
export function Reveal({
  children,
  delay = 0,
  y = 12,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
}) {
  const reduced = useMotionPrefs();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ ...atlasSpring(false), delay }}
    >
      {children}
    </motion.div>
  );
}
