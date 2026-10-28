"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Appearance control: a segmented System / Light / Dark choice (HIG segmented
 * control, radiogroup semantics). "System" follows the OS and is the default.
 * The pre-hydration script in ThemeScript reads the same storage key, so
 * first paint already matches. Every instance stays in sync via an event.
 */

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "atlas-theme";
const SYNC_EVENT = "atlas-theme-change";
const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  // Keep the browser chrome (status bar / tab strip) in step with the page.
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  // Tailwind's dark: variant keys off this class (see globals.css).
  root.classList.toggle("dark", dark);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? "#0a0a0a" : "#fafafa";
  }
}

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage blocked: follow the system */
  }
  return "system";
}

function useAppearance(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readChoice());
    const sync = () => setChoice(readChoice());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked: still apply for this page view */
    }
    apply(next);
    setChoice(next);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  return [choice, select];
}

/** Arrow keys move between segments, as a native radiogroup does. */
function onArrow(e: React.KeyboardEvent, choice: ThemeChoice, select: (c: ThemeChoice) => void) {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  const i = OPTIONS.findIndex((o) => o.value === choice);
  const next = OPTIONS[(i + (e.key === "ArrowRight" ? 1 : OPTIONS.length - 1)) % OPTIONS.length]!;
  select(next.value);
  (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
}

/** Labelled control for Settings. */
export function AppearanceControl() {
  const [choice, select] = useAppearance();
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="segmented w-full"
      onKeyDown={(e) => onArrow(e, choice, select)}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          data-value={value}
          aria-checked={choice === value}
          tabIndex={choice === value ? 0 : -1}
          onClick={() => select(value)}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Compact one-button toggle for the top bar: flips between light and dark (Settings offers System). */
export function ThemeToggle() {
  const [choice, select] = useAppearance();
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => setSystemDark(window.matchMedia("(prefers-color-scheme: dark)").matches), []);
  const dark = choice === "dark" || (choice === "system" && systemDark);
  return (
    <button type="button" className="icon-btn" aria-label={dark ? "Use light appearance" : "Use dark appearance"} title="Appearance" onClick={() => select(dark ? "light" : "dark")}>
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
