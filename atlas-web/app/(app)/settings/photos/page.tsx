"use client";

import { useMutation, useQuery } from "convex/react";
import { Camera, Check, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useRef } from "react";
import { PageHead, PageLoading, Spinner, toast, useRun } from "@/components/ui";
import { normalizePhoto, uploadBlob } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";

const MAX = 3;

export default function PhotosPage() {
  const avatars = useQuery(api.avatars.list);
  const consents = useQuery(api.consent.list);
  const setConsent = useMutation(api.consent.set);
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const create = useMutation(api.avatars.create);
  const setDefault = useMutation(api.avatars.setDefault);
  const remove = useMutation(api.avatars.remove);
  const { run, busy } = useRun();
  const input = useRef<HTMLInputElement>(null);

  if (avatars === undefined || consents === undefined) return <PageLoading />;
  const allowed = consents.find((c) => c.scope === "person_image_use")?.granted;

  const add = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Choose a photo.", "bad");
    await run(async () => {
      const blob = await normalizePhoto(file, 2048);
      await create({ storageId: await uploadBlob(await generateUploadUrl({}), blob) });
    }, "Photo added");
    if (input.current) input.current.value = "";
  };

  return (
    <div className="page page-narrow">
      <PageHead title="Your photos" crumb={{ href: "/settings", label: "Settings" }} sub="Used only to show your own looks on you. Never shared unless you share a try-on link." />

      <section className="grouped">
        <ul className="grouped-list">
          <li>
            <label className="check-row !px-4">
              <span className="flex-1">
                <span className="row-title">Use my photo for try-ons</span>
                <span className="row-detail">Processed by Amazon Bedrock only. Turning this off also disables any share links.</span>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={Boolean(allowed)}
                disabled={busy}
                onChange={(e) => run(() => setConsent({ scope: "person_image_use", granted: e.target.checked }), e.target.checked ? "Allowed" : "Turned off")}
              />
            </label>
          </li>
        </ul>
      </section>

      {allowed && (
        <>
          <div className="tile-grid section">
            {avatars.map((a) => (
              <div key={a._id} className="tile cursor-default">
                <div className="tile-media cover">
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
                    <img src={a.url} alt={a.label} />
                  ) : (
                    <UserRound size={32} aria-hidden="true" />
                  )}
                  {a.isDefault && (
                    <span className="tile-badge badge badge-good">
                      <Check size={11} aria-hidden="true" /> Used for try-ons
                    </span>
                  )}
                </div>
                <div className="tile-body flex items-center gap-1">
                  <span className="tile-title flex-1">{a.label}</span>
                  {!a.isDefault && (
                    <button type="button" className="btn-ghost !px-2" disabled={busy} onClick={() => run(() => setDefault({ avatarId: a._id }), "Using this photo")}>
                      Use
                    </button>
                  )}
                  <button type="button" className="btn-ghost !px-2" aria-label={`Delete ${a.label}`} disabled={busy} onClick={() => run(() => remove({ avatarId: a._id }), "Photo deleted")}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
            {avatars.length < MAX && (
              <label className="dropzone !p-6 aspect-[3/4]">
                <input ref={input} type="file" accept="image/*" className="visually-hidden" disabled={busy} onChange={(e) => void add(e.target.files?.[0])} />
                {busy ? <Spinner size={24} /> : <Camera size={26} aria-hidden="true" />}
                <span className="font-semibold">Add a photo</span>
                <span className="muted text-[13px]">Full length, facing the camera, plain background, fitted clothes.</span>
              </label>
            )}
          </div>
          <p className="policy-line">
            <ShieldCheck size={14} aria-hidden="true" /> Keep up to {MAX}. Deleting a photo removes the file immediately.
          </p>
        </>
      )}
    </div>
  );
}
