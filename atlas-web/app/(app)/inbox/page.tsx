"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Camera, ChevronRight, Inbox, Mail, RefreshCw, Shirt, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { Empty, JobProgress, PageHead, relativeTime, SkeletonGrid, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { formatMoney } from "@/lib/format";

function greeting(name?: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

const URGENCY_BADGE: Record<string, string> = { high: "badge-danger", urgent: "badge-danger", review: "badge-alert" };

export default function TodayPage() {
  const me = useQuery(api.users.me);
  const counts = useQuery(api.items.counts);
  const signals = useQuery(api.inbox.signals);
  const notifications = useQuery(api.inbox.notifications);
  const review = useQuery(api.uploads.needsReview);
  const jobs = useQuery(api.items.jobs);
  const suggestions = useQuery(api.sources.suggestions);
  const approvals = useQuery(api.approvals.pending);
  const refresh = useMutation(api.inbox.refresh);
  const dismiss = useMutation(api.sources.dismissSuggestion);
  const { run, busy } = useRun();

  const today = notifications?.find((n) => n.dedupKey.startsWith("morning:") && Date.now() - n.createdAt < 20 * 3_600_000);
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (counts === undefined || signals === undefined) {
    return (
      <div className="page">
        <PageHead eyebrow={date} title={`${greeting()}.`} />
        <SkeletonGrid count={4} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead
        eyebrow={date}
        title={`${greeting(me?.name)}.`}
        actions={
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => refresh({}), "Up to date")}>
            <RefreshCw size={16} className={busy ? "spin" : undefined} aria-hidden="true" /> Refresh
          </button>
        }
      />

      {counts.ready === 0 ? (
        <div className="hero-card section">
          <p className="eyebrow !text-white/80">Get started</p>
          <h2 className="text-[26px] font-bold tracking-tight leading-tight mt-1">Photograph your clothes once. Atlas does the rest.</h2>
          <p className="mt-2 text-white/85 max-w-xl">
            Snap a few photos — a pile on the bed works. Atlas finds each piece, cuts it out and tags it, then builds outfits and tracks what
            you actually wear.
          </p>
          <div className="mt-5 flex gap-2 flex-wrap">
            <Link href="/wardrobe/add" className="btn-primary">
              <Camera size={16} aria-hidden="true" /> Add clothes
            </Link>
            <Link href="/sources" className="btn">
              <Mail size={16} aria-hidden="true" /> Find purchases in Gmail
            </Link>
          </div>
        </div>
      ) : (
        <div className="stat-grid section">
          <Link href="/wardrobe" className="stat press no-underline">
            <span className="stat-label">Pieces</span>
            <span className="stat-value">{counts.ready}</span>
          </Link>
          <Link href="/wardrobe?laundry=worn" className="stat press no-underline">
            <span className="stat-label">Worn, not washed</span>
            <span className="stat-value">{counts.worn}</span>
          </Link>
          <div className="stat">
            <span className="stat-label">Wears logged</span>
            <span className="stat-value">{counts.wears}</span>
          </div>
          {counts.value > 0 && (
            <div className="stat">
              <span className="stat-label">Cost per wear</span>
              <span className="stat-value">{formatMoney(counts.pricedWears ? counts.value / counts.pricedWears : counts.value, "USD")}</span>
            </div>
          )}
        </div>
      )}

      {today && (
        <Link href={today.action.href} className="list-card section block no-underline">
          <div className="list-row">
            <span className="grouped-icon" style={{ background: "#af52de" }} aria-hidden="true">
              <Shirt size={17} />
            </span>
            <div className="list-main">
              <div className="list-title">{today.title}</div>
              <div className="list-sub">{today.detail}</div>
            </div>
            <ChevronRight size={18} className="grouped-chevron" aria-hidden="true" />
          </div>
        </Link>
      )}

      {(approvals?.length ?? 0) > 0 && (
        <section className="section">
          <h2 className="section-title">Waiting for you</h2>
          <div className="list-card">
            {approvals!.map((a) => (
              <Link key={a._id} href={a.threadId ? `/ask?t=${a.threadId}` : `/looks/${a.outfitId}`} className="list-row">
                <span className="dot" aria-hidden="true" />
                <div className="list-main">
                  <div className="list-title">Approve a try-on</div>
                  <div className="list-sub">{a.summary}</div>
                </div>
                <ChevronRight size={18} className="grouped-chevron" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {((review?.length ?? 0) > 0 || (jobs?.length ?? 0) > 0) && (
        <section className="section">
          <h2 className="section-title">
            Imports <Link href="/wardrobe/add">Open</Link>
          </h2>
          <div className="list-card">
            {(review?.length ?? 0) > 0 && (
              <Link href="/wardrobe/add" className="list-row">
                <span className="dot" aria-hidden="true" />
                <div className="list-main">
                  <div className="list-title">
                    {review!.length} photo{review!.length === 1 ? "" : "s"} ready to review
                  </div>
                  <div className="list-sub">Choose which pieces to add to your wardrobe.</div>
                </div>
                <ChevronRight size={18} className="grouped-chevron" aria-hidden="true" />
              </Link>
            )}
            {jobs?.map((job) => (
              <div key={job._id} className="list-row">
                <div className="list-main">
                  <div className="list-title capitalize">{job.type === "tryon" ? "Try-on" : job.type === "gmail_scan" ? "Gmail scan" : job.type === "scan" ? "Finding clothes" : "Cutting out"}</div>
                  <JobProgress job={job} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Signals</h2>
        {signals.length === 0 ? (
          <Empty icon={Inbox} title="Nothing needs you" body="Atlas will flag renewals, price changes, pieces you never wear and laundry piling up — only when it matters." />
        ) : (
          <div className="list-card">
            {signals.map((s) => (
              <Link key={s._id} href={`/signals/${s._id}`} className="list-row">
                <div className="list-main">
                  <div className="list-title">{s.title}</div>
                  <div className="list-sub">{s.implication}</div>
                </div>
                <span className={`badge ${URGENCY_BADGE[s.urgency] ?? "badge-accent"}`}>{s.domains[0] ?? s.kind}</span>
                <ChevronRight size={18} className="grouped-chevron" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {(suggestions?.length ?? 0) > 0 && (
        <section className="section" id="purchases">
          <h2 className="section-title">From your receipts</h2>
          <div className="list-card">
            {suggestions!.map((s) => (
              <div key={s._id} className="list-row">
                <span className="grouped-icon" style={{ background: "#34c759" }} aria-hidden="true">
                  <Sparkles size={17} />
                </span>
                <div className="list-main">
                  <div className="list-title">{s.title}</div>
                  <div className="list-sub">
                    {s.merchant}
                    {s.price ? ` · ${formatMoney(s.price, s.currency ?? "USD")}` : ""} · {relativeTime(s.createdAt)}
                  </div>
                </div>
                <Link href={`/wardrobe/add?suggestion=${s._id}`} className="btn-secondary">
                  Add photo <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <button type="button" className="btn-ghost" aria-label={`Dismiss ${s.title}`} onClick={() => run(() => dismiss({ suggestionId: s._id }))}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
