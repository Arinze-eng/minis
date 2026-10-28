import { ConvexError, type Value } from "convex/values";

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "CONSENT_REQUIRED",
  "SPEND_KILL_SWITCH",
  "UPSTREAM_FAILED",
  "CONFLICT",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type AppErrorData = { code: ErrorCode; message: string; details?: Record<string, Value> };

/** Every thrown application error goes through here so clients can switch on `error.data.code`. */
export function appError(code: ErrorCode, message: string, details?: Record<string, Value>): ConvexError<AppErrorData> {
  return new ConvexError<AppErrorData>({ code, message, ...(details ? { details } : {}) });
}

export function isAppError(error: unknown): error is ConvexError<AppErrorData> {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    "message" in error.data
  );
}
