"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Theme control: cycles light → dark → system, persists the explicit choice
 * in localStorage. The pre-hydration FOUC guard in the root layout consumes
 * the same keys, so the toggle only ever refines what is already rendered.
 */

type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "atlas-theme";
const ORDER: ThemeChoice[] = ["light", "dark", "system"];

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme"); // media query in globals.css decides
  } else {
    root.setAttribute("data-theme", choice);
  }
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
    if (stored && ORDER.includes(stored)) setChoice(stored);
  }, []);

  const cycle = useCallback(() => {
    setChoice((prev) => {
      const idx = ORDER.indexOf(prev);
      const next = ORDER[(idx + 1) % ORDER.length] ?? "system";
      window.localStorage.setItem(STORAGE_KEY, next);
      apply(next);
      return next;
    });
  }, []);

  const label =
    choice === "light"
      ? "Theme: light (activate to switch to dark)"
      : choice === "dark"
        ? "Theme: dark (activate to follow system)"
        : "Theme: system (activate to switch to light)";
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={label}
      title={label}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
