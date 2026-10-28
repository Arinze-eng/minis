import { appError } from "./errors";

/** A deployment setting that must exist; fails loudly with the variable's name. */
export function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === undefined) throw appError("UPSTREAM_FAILED", `Server setting ${name} is missing.`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Comma-separated list (key pools, provider chains); empty entries dropped. */
export function envList(name: string): string[] {
  return (optionalEnv(name) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function envFlag(name: string): boolean {
  return optionalEnv(name)?.toLowerCase() === "true";
}

export function envNumber(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
