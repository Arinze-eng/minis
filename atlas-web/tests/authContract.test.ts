import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pins the Clerk Core 3 auth contract in source.
 *
 * `@clerk/nextjs` v7 (Clerk Core 3) removed `<SignedIn>`, `<SignedOut>` and
 * `<Protect>`: rendering them throws, and `createRouteMatcher()` is deprecated
 * and warns at runtime. A previous revision of this app shipped both, which
 * broke the header identity control on configured deployments — the exact
 * regression this test guards.
 *
 * The rules below mirror the official upgrade guide:
 * https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !full.includes("tests")) {
      out.push(full);
    }
  }
  return out;
}

const files = [
  ...sourceFiles(join(projectRoot, "app")),
  ...sourceFiles(join(projectRoot, "components")),
  ...sourceFiles(join(projectRoot, "lib")),
  join(projectRoot, "middleware.ts"),
];

/** Strip comments so prose *about* an API never counts as a usage of it. */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

const read = (file: string) => ({
  file: relative(projectRoot, file),
  text: stripComments(readFileSync(file, "utf8")),
});

describe("Clerk Core 3 auth contract", () => {
  it("never imports the removed control components", () => {
    for (const { file, text } of files.map(read)) {
      const clerkImport = /import\s*\{([^}]*)\}\s*from\s*"@clerk\/nextjs"/.exec(text);
      if (!clerkImport) continue;
      const imported = clerkImport[1] ?? "";
      for (const removed of ["SignedIn", "SignedOut", "Protect"]) {
        expect(
          imported.includes(removed),
          `${file} imports the removed <${removed}> component; use <Show when="signed-in" | "signed-out">`,
        ).toBe(false);
      }
    }
  });

  it("uses <Show> for signed-in / signed-out rendering", () => {
    const identitySurface = files
      .map(read)
      .find(({ file }) => file.endsWith("AuthControls.tsx"));
    expect(identitySurface).toBeDefined();
    expect(identitySurface?.text).toContain('when="signed-in"');
    expect(identitySurface?.text).toContain('when="signed-out"');
  });

  it("does not use the deprecated createRouteMatcher() helper", () => {
    for (const { file, text } of files.map(read)) {
      expect(text.includes("createRouteMatcher"), `${file} still uses createRouteMatcher()`).toBe(false);
    }
  });

  it("does not use removed redirect props", () => {
    for (const { file, text } of files.map(read)) {
      for (const prop of ["afterSignInUrl", "afterSignUpUrl", "clerkJSUrl", "clerkJSVersion"]) {
        expect(text.includes(prop), `${file} uses the removed prop ${prop}`).toBe(false);
      }
    }
  });

  it("keeps Clerk out of unconfigured deployments", () => {
    for (const { file, text } of files.map(read)) {
      if (!/from\s*"@clerk\/nextjs"/.test(text)) continue;
      // Every static Clerk import must sit inside a module that checks
      // configuration first, or be lazily imported after the check.
      const checksConfig =
        text.includes("clerkConfigured()") ||
        text.includes("await import(\"@clerk/nextjs\")") ||
        text.includes('await import("@clerk/nextjs/server")');
      expect(checksConfig, `${file} imports Clerk without a configuration check`).toBe(true);
    }
  });
});
