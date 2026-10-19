"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, BellOff, Check, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Empty, PageHead, PageLoading, relativeTime, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";

export default function SignalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const signal = useQuery(api.inbox.signal, { signalId: id });
  const setState = useMutation(api.inbox.setSignalState);
  const { run, busy } = useRun();

  if (signal === undefined) return <PageLoading />;
  if (signal === null) {
    return (
      <div className="page page-narrow">
        <Empty title="Signal not found" body="It may have been resolved already." action={{ href: "/inbox", label: "Back to Today" }} />
      </div>
    );
  }

  const act = async (state: "done" | "dismissed" | "snoozed", note: string) => {
    const ok = await run(() => setState({ signalId: signal._id, state, until: state === "snoozed" ? Date.now() + 3 * 86_400_000 : undefined }), note);
    if (ok !== undefined) router.push("/inbox");
  };

  return (
    <div className="page page-narrow">
      <PageHead title={signal.title} crumb={{ href: "/inbox", label: "Today" }} sub={`Noticed ${relativeTime(signal.createdAt)} · ${signal.noticed}`} />

      <div className="card card-pad stack-md">
        <p className="m-0 text-[17px] leading-relaxed">{signal.implication}</p>
        <Link href={signal.primaryAction.href} className="btn-primary justify-self-start">
          {signal.primaryAction.label} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <section className="section mt-8" id="why">
        <h2 className="section-title">Why Atlas thinks so</h2>
        <dl className="card card-pad kv">
          {signal.evidence.map((e) => (
            <div key={e.label} className="contents">
              <dt>{e.label}</dt>
              <dd className="!normal-case">{e.detail}</dd>
            </div>
          ))}
          <dt>Confidence</dt>
          <dd>{Math.round((1 - signal.uncertainty) * 100)}%</dd>
        </dl>
        <p className="section-footer">Atlas only advises or prepares. It never pays, cancels or emails anyone for you.</p>
      </section>

      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => act("done", "Marked done")}>
          <Check size={16} aria-hidden="true" /> Done
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => act("snoozed", "Snoozed for 3 days")}>
          <BellOff size={16} aria-hidden="true" /> Snooze 3 days
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => act("dismissed", "Dismissed")}>
          <X size={16} aria-hidden="true" /> Not useful
        </button>
      </div>
    </div>
  );
}
