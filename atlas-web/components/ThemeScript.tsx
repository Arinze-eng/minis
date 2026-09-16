"use client";

/**
 * FOUC guard: runs before hydration to set `data-theme` from the persisted
 * explicit choice, so first paint already matches the user's theme. Kept
 * tiny and dependency-free.
 */

export const THEME_SCRIPT = `(() => {
  try {
    const choice = localStorage.getItem("atlas-theme");
    if (choice === "light" || choice === "dark") {
      document.documentElement.setAttribute("data-theme", choice);
      document.documentElement.classList.toggle("dark", choice === "dark");
    }
  } catch {
    /* private mode etc. — media query in CSS decides */
  }
})();`;

export function ThemeScript() {
  return (
    <script
      id="atlas-theme-script"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
    />
  );
}
