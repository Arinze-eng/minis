import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { LIMITS } from "../shared/domain";

type Step = Doc<"jobs">["steps"][number];

export async function createJob(
  ctx: MutationCtx,
  input: { userId: Id<"users">; type: Doc<"jobs">["type"]; steps: { key: string; label: string }[]; uploadId?: Id<"uploads">; batchId?: string },
): Promise<Id<"jobs">> {
  const now = Date.now();
  return ctx.db.insert("jobs", {
    userId: input.userId,
    type: input.type,
    status: "running",
    steps: input.steps.map((s) => ({ ...s, status: "pending" as const })),
    progress: 0,
    uploadId: input.uploadId,
    batchId: input.batchId,
    createdAt: now,
    updatedAt: now,
  });
}

function progressOf(steps: Step[]): number {
  if (steps.length === 0) return 0;
  const finished = steps.filter((s) => s.status === "done" || s.status === "failed" || s.status === "skipped").length;
  const running = steps.filter((s) => s.status === "running").length * 0.5;
  return Math.min(1, (finished + running) / steps.length);
}

/** Update one step and recompute progress; finishes the job when every step has settled. */
export async function setStep(ctx: MutationCtx, jobId: Id<"jobs">, key: string, patch: { status: Step["status"]; label?: string; error?: string }) {
  const job = await ctx.db.get(jobId);
  if (!job) return;
  const now = Date.now();
  const steps = job.steps.map((s) =>
    s.key !== key
      ? s
      : {
          ...s,
          status: patch.status,
          label: patch.label ?? s.label,
          error: patch.error,
          startedAt: s.startedAt ?? (patch.status === "running" ? now : undefined),
          finishedAt: patch.status === "running" || patch.status === "pending" ? undefined : now,
        },
  );
  const settled = steps.every((s) => s.status === "done" || s.status === "failed" || s.status === "skipped");
  const failed = steps.filter((s) => s.status === "failed").length;
  const status = !settled ? "running" : failed === 0 ? "done" : failed === steps.length ? "failed" : "partial";
  await ctx.db.patch(jobId, {
    steps,
    progress: settled ? 1 : progressOf(steps),
    status,
    error: settled && failed > 0 ? steps.find((s) => s.error)?.error : undefined,
    updatedAt: now,
    completedAt: settled ? now : undefined,
  });
}

/** Running units per user: a whole photo batch counts once. */
export async function assertBelowJobLimit(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const running = await ctx.db
    .query("jobs")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "running"))
    .take(50);
  const fresh = running.filter((j) => Date.now() - j.updatedAt < 15 * 60_000);
  const units = new Set(fresh.map((j) => j.batchId ?? j._id)).size;
  if (units >= LIMITS.maxRunningJobsPerUser) {
    throw appError("RATE_LIMITED", `You already have ${units} imports or try-ons running. Wait for one to finish.`);
  }
}

/** Workpool reports failures as raw strings ("Uncaught ConvexError: {json}"); keep only the user-facing message. */
export function readableError(raw: string): string {
  const json = raw.match(/\{.*\}/s)?.[0];
  if (json) {
    try {
      const data = JSON.parse(json) as { message?: unknown };
      if (typeof data.message === "string") return data.message.slice(0, 200);
    } catch {
      // not JSON: fall through
    }
  }
  const plain = raw.replace(/^Uncaught \w*Error:\s*/, "").split("\n")[0] ?? "";
  return plain && plain.length < 160 ? plain : "Something went wrong while processing this.";
}
