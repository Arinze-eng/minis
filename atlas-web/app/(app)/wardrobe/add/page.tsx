"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Camera, Check, ImagePlus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { JobProgress, PageHead, PageLoading, relativeTime, Spinner, toast, useRun } from "@/components/ui";
import { normalizePhoto, uploadBlob } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const MAX_PHOTOS = 20;
const MAX_BYTES = 25 * 1024 * 1024; // before in-browser downscaling

type Upload = Doc<"uploads"> & { url: string | null; job: Doc<"jobs"> | null };

const STATUS_TEXT: Record<string, string> = {
  queued: "Waiting in line…",
  detecting: "Finding clothes…",
  extracting: "Cutting out your pieces…",
  done: "Added",
  failed: "Couldn't read this photo",
};

/** Numbered boxes on the photo plus a matching checklist; tapping either toggles the piece. */
function Review({ upload }: { upload: Upload }) {
  const candidates = upload.candidates ?? [];
  const [picked, setPicked] = useState<Set<number>>(() => new Set(candidates.map((_, i) => i)));
  const confirm = useMutation(api.uploads.confirmSelection);
  const remove = useMutation(api.uploads.remove);
  const { run, busy } = useRun();
  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (candidates.length === 0) {
    return (
      <div className="card card-pad flex items-center gap-3 flex-wrap">
        <p className="muted flex-1">No clothing found in {upload.fileName}. Try a photo with the pieces laid flat or hung up, in good light.</p>
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => remove({ uploadId: upload._id }))}>
          Remove photo
        </button>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="detail-grid p-4">
        <div className="review-frame">
          {upload.url && (
            // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
            <img src={upload.url} alt={upload.fileName} />
          )}
          {candidates.map((c, i) => {
            const [x0, y0, x1, y1] = c.bbox;
            return (
              <button
                key={i}
                type="button"
                className="bbox"
                aria-pressed={picked.has(i)}
                aria-label={`${picked.has(i) ? "Deselect" : "Select"} ${c.name}`}
                style={{ left: `${x0! * 100}%`, top: `${y0! * 100}%`, width: `${(x1! - x0!) * 100}%`, height: `${(y1! - y0!) * 100}%` }}
                onClick={() => toggle(i)}
              >
                <span>{i + 1}</span>
              </button>
            );
          })}
        </div>
        <div className="stack-sm">
          <h3 className="text-[17px] font-semibold">Found {candidates.length} piece{candidates.length === 1 ? "" : "s"}</h3>
          <p className="muted">Untick anything that isn't yours or that you don't want in your wardrobe.</p>
          <ul className="grouped-list">
            {candidates.map((c, i) => (
              <li key={i}>
                <label className="check-row">
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                  <span className="min-w-0">
                    <span className="row-title">
                      {i + 1}. {c.name}
                    </span>
                    <span className="row-detail capitalize">
                      {c.colours.primary} · {c.material} · {c.category}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || picked.size === 0}
              onClick={() => run(() => confirm({ uploadId: upload._id, indices: [...picked] }), `Adding ${picked.size} piece${picked.size === 1 ? "" : "s"}`)}
            >
              <Check size={16} aria-hidden="true" /> Add {picked.size} piece{picked.size === 1 ? "" : "s"}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => remove({ uploadId: upload._id }), "Photo removed")}>
              <Trash2 size={16} aria-hidden="true" /> Skip photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddClothes() {
  const params = useSearchParams();
  const suggestionId = (params.get("suggestion") ?? undefined) as Id<"garmentSuggestions"> | undefined;
  const consents = useQuery(api.consent.list);
  const uploads = useQuery(api.uploads.recent) as Upload[] | undefined;
  const setConsent = useMutation(api.consent.set);
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const createBatch = useMutation(api.uploads.createBatch);
  const { run, busy } = useRun();
  const [sending, setSending] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (consents === undefined || uploads === undefined) return <PageLoading />;
  const allowed = consents.find((c) => c.scope === "garment_image_analysis")?.granted;

  const send = async (list: FileList | File[]) => {
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return toast("Choose photos (JPEG, PNG, HEIC or WebP).", "bad");
    if (files.length > MAX_PHOTOS) return toast(`Add up to ${MAX_PHOTOS} photos at a time.`, "bad");
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) return toast(`${tooBig.name} is over 25 MB.`, "bad");
    await run(async () => {
      const stored: { storageId: Id<"_storage">; fileName: string }[] = [];
      for (const [i, file] of files.entries()) {
        setSending(`Preparing photo ${i + 1} of ${files.length}…`);
        let blob: Blob;
        try {
          blob = await normalizePhoto(file);
        } catch {
          throw new Error(`${file.name} couldn't be read. Try a JPEG or PNG.`);
        }
        stored.push({ storageId: await uploadBlob(await generateUploadUrl({}), blob), fileName: file.name.slice(0, 120) });
      }
      setSending("Starting…");
      await createBatch({ files: stored, suggestionId });
    }, `${files.length} photo${files.length === 1 ? "" : "s"} uploaded — Atlas is looking for clothes`);
    setSending(null);
    if (input.current) input.current.value = "";
  };

  const awaiting = uploads.filter((u) => u.status === "awaiting_selection");
  const others = uploads.filter((u) => u.status !== "awaiting_selection");

  return (
    <div className="page">
      <PageHead title="Add clothes" crumb={{ href: "/wardrobe", label: "Wardrobe" }} sub="Several pieces per photo is fine — a pile on the bed works." />

      {!allowed ? (
        <div className="card card-pad stack-md section">
          <div className="flex items-start gap-3">
            <span className="grouped-icon" style={{ background: "#0071e3" }} aria-hidden="true">
              <ShieldCheck size={17} />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold">Allow clothing photo analysis</h2>
              <p className="muted mt-1">
                Your photos are analysed by Amazon Bedrock or Groq to find and tag each piece. They are never sent to free services that train on
                data, never shared, and you can delete them any time in Privacy &amp; data.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary justify-self-start"
            disabled={busy}
            onClick={() => run(() => setConsent({ scope: "garment_image_analysis", granted: true }), "Allowed")}
          >
            Allow and continue
          </button>
        </div>
      ) : (
        <label
          className="dropzone section"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (!busy) void send(e.dataTransfer.files);
          }}
        >
          <input ref={input} type="file" accept="image/*" multiple className="visually-hidden" disabled={busy} onChange={(e) => e.target.files && void send(e.target.files)} />
          {sending ? (
            <>
              <Spinner size={28} />
              <span className="font-semibold">{sending}</span>
            </>
          ) : (
            <>
              <span className="empty-icon !mb-1" aria-hidden="true">
                <ImagePlus size={26} />
              </span>
              <span className="text-[17px] font-semibold">Choose photos or drop them here</span>
              <span className="muted">Up to {MAX_PHOTOS} at a time. Photos are resized and stripped of location data before upload.</span>
              <span className="btn-primary mt-2">
                <Camera size={16} aria-hidden="true" /> Choose photos
              </span>
            </>
          )}
        </label>
      )}

      {awaiting.length > 0 && (
        <section className="section stack-md">
          <h2 className="section-title">Review</h2>
          {awaiting.map((u) => (
            <Review key={u._id} upload={u} />
          ))}
        </section>
      )}

      {others.length > 0 && (
        <section className="section">
          <h2 className="section-title">Recent photos</h2>
          <div className="list-card">
            {others.map((u) => (
              <div key={u._id} className="list-row">
                {u.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
                  <img src={u.url} alt="" className="w-12 h-12 rounded-[10px] object-cover flex-none" />
                )}
                <div className="list-main">
                  <div className="list-title truncate">{u.fileName}</div>
                  <div className="list-sub flex items-center gap-1.5">
                    {u.status === "failed" && <AlertTriangle size={13} aria-hidden="true" />}
                    {u.status === "failed" ? (u.error ?? STATUS_TEXT.failed) : STATUS_TEXT[u.status]} · {relativeTime(u.createdAt)}
                  </div>
                  {(u.status === "queued" || u.status === "detecting" || u.status === "extracting") && <JobProgress job={u.job} />}
                </div>
                {u.status === "done" && (
                  <Link href="/wardrobe" className="btn-ghost">
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AddClothes />
    </Suspense>
  );
}
