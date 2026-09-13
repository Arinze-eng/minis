"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { motion } from "motion/react";
import {
  validateUpload,
  UPLOAD_LIMITS,
  type PendingConfirmation,
  type UploadState,
} from "@/lib/wardrobe";
import { atlasSpring, useMotionPrefs } from "@/lib/motion";

/**
 * Garment capture flow — the real §10 pipeline:
 * pick → client validate → consent disclosure (server-recorded) →
 * POST /api/wardrobe/upload (signed Cloudinary, private) → review tags →
 * PATCH /api/wardrobe (confirm, user-confirmed provenance) → resolved.
 *
 * Honesty rules: provider-unavailable is a visible 503 state, never a
 * simulation; tags entered by the user are labelled user-confirmed (model
 * suggestions appear only when an analysis provider is configured).
 */

const CATEGORY_OPTIONS = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "one_piece",
  "underlayer",
  "other",
] as const;

function TagReview({
  pending,
  onConfirm,
}: {
  pending: PendingConfirmation;
  onConfirm: (values: {
    name: string;
    category: string;
    colors: string;
    material: string;
    warmth: string;
    formality: string;
  }) => void;
}) {
  const { garment, suggestedTags } = pending;
  const [values, setValues] = useState({
    name: suggestedTags["name"]?.value ?? "",
    category: suggestedTags["category"]?.value ?? "top",
    colors: garment.colors.join(", "),
    material: "",
    warmth: "1",
    formality: "1",
  });
  const hasModelSuggestions = Object.keys(suggestedTags).length > 0;

  const set = (field: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const valid = values.name.trim().length > 0;

  return (
    <section className="tag-review" aria-labelledby="tag-review-h">
      <h2 id="tag-review-h">Describe this garment</h2>
      <p className="tag-review-note">
        {hasModelSuggestions
          ? "Suggestions come from an analysis model — your edits are recorded as user-confirmed."
          : "Your photo is stored privately. Automated tag analysis needs an analysis provider; these details are recorded as user-confirmed, which outfit planning treats as the strongest signal."}
      </p>

      <div className="tag-grid">
        <label className="tag-field">
          <span>Name</span>
          <input type="text" value={values.name} onChange={set("name")} required />
        </label>

        <label className="tag-field">
          <span>Category</span>
          <select value={values.category} onChange={set("category")}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="tag-field">
          <span>Colors (comma-separated)</span>
          <input type="text" value={values.colors} onChange={set("colors")} placeholder="e.g. olive, cream" />
        </label>

        <label className="tag-field">
          <span>Material</span>
          <input type="text" value={values.material} onChange={set("material")} placeholder="e.g. cotton twill" />
        </label>

        <label className="tag-field">
          <span>Warmth (0–3)</span>
          <input type="number" min={0} max={3} value={values.warmth} onChange={set("warmth")} />
        </label>

        <label className="tag-field">
          <span>Formality (0–3)</span>
          <input type="number" min={0} max={3} value={values.formality} onChange={set("formality")} />
        </label>
      </div>

      <div className="tag-review-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!valid}
          onClick={() => onConfirm(values)}
        >
          Confirm garment
        </button>
      </div>
      <p className="tag-review-footnote">
        Confirming stores the garment with your provenance and makes it usable
        by outfit planning. The photo stays private and deletable from your
        wardrobe.
      </p>
    </section>
  );
}

export function CaptureFlow({
  initialPending,
}: {
  initialPending: PendingConfirmation | null;
}) {
  const [state, setState] = useState<UploadState>(
    initialPending
      ? { phase: "review_required", pending: initialPending }
      : { phase: "idle" },
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [consent, setConsent] = useState<"unknown" | "granted" | "not_granted">("unknown");
  const [errorNote, setErrorNote] = useState("");
  const reduced = useMotionPrefs();

  // Load the server-authoritative consent record on mount.
  useEffect(() => {
    let alive = true;
    fetch("/api/consent", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { grants?: Array<{ scope: string; granted: boolean }> } | null) => {
        if (!alive || !data?.grants) return;
        const g = data.grants.find((x) => x.scope === "garment_image_analysis");
        setConsent(g?.granted ? "granted" : "not_granted");
      })
      .catch(() => {
        if (alive) setConsent("not_granted");
      });
    return () => {
      alive = false;
    };
  }, []);

  const onPick = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const validation = validateUpload(file.name, file.size, file.type || "image/jpeg");
      if (!validation.ok) {
        setState({ phase: "error_retry", reason: validation.reason });
        setPreviewUrl(null);
        return;
      }
      setPreviewUrl(URL.createObjectURL(file));
      setFileBytes(file);
      setState({ phase: "picked", fileName: file.name, sizeBytes: file.size, mimeType: file.type });
    },
    [],
  );

  const grantAndUpload = useCallback(async () => {
    if (!fileBytes || state.phase !== "picked") return;
    setErrorNote("");
    try {
      const consentRes = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "garment_image_analysis", granted: true }),
      });
      if (!consentRes.ok) {
        setErrorNote("Could not record your consent — nothing was uploaded. Try again.");
        return;
      }
      setConsent("granted");

      setState({ phase: "uploading", fileName: fileBytes.name, progress: 60 });
      const form = new FormData();
      form.set("image", fileBytes);
      form.set("name", "");
      const res = await fetch("/api/wardrobe/upload", { method: "POST", body: form });

      if (res.status === 503) {
        setState({ phase: "error_retry", reason: "Image storage is not configured on this deployment — upload is unavailable." });
        return;
      }
      if (res.status === 403) {
        setConsent("not_granted");
        setState({ phase: "picked", fileName: fileBytes.name, sizeBytes: fileBytes.size, mimeType: fileBytes.type });
        setErrorNote("Consent was not active on the server — review the disclosure and continue.");
        return;
      }
      if (res.status === 502) {
        const data = (await res.json().catch(() => null)) as { reason?: string } | null;
        setState({ phase: "error_retry", reason: "The image provider rejected the upload — you can retry." });
        setErrorNote(data?.reason ? `Provider said: ${data.reason}` : "");
        return;
      }
      if (res.status === 400) {
        const data = (await res.json().catch(() => null)) as { reason?: string } | null;
        setState({ phase: "error_retry", reason: `That image was rejected server-side (${data?.reason ?? "invalid_image"}).` });
        return;
      }
      if (!res.ok) {
        setState({ phase: "error_retry", reason: "Upload failed — you can retry." });
        return;
      }

      const data = (await res.json()) as {
        garment: { id: string; name: string; imageRef?: string | null };
      };
      setState({ phase: "analyzing", fileName: fileBytes.name });
      setState({
        phase: "review_required",
        pending: {
          garment: {
            id: data.garment.id,
            name: "New wardrobe piece",
            category: "top",
            colors: [],
            warmth: 1,
            formality: 1,
            seasons: [],
            occasions: [],
            wearCount: 0,
            status: "needs_confirmation",
            analysisProvider: "user",
            imageRef: data.garment.imageRef ?? null,
            imageAlt: "Uploaded garment capture pending review",
            addedAt: new Date().toISOString(),
            correctionHistory: [],
          },
          suggestedTags: {},
        },
      });
    } catch {
      setState({ phase: "error_retry", reason: "You appear to be offline — the image was not uploaded." });
    }
  }, [fileBytes, state.phase]);

  const confirm = useCallback(
    async (values: {
      name: string;
      category: string;
      colors: string;
      material: string;
      warmth: string;
      formality: string;
    }) => {
      if (state.phase !== "review_required") return;
      const id = state.pending.garment.id;
      try {
        const res = await fetch("/api/wardrobe", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: values.name,
            category: values.category,
            colors: values.colors.split(",").map((s) => s.trim()).filter(Boolean),
            material: values.material || null,
            warmth: Number(values.warmth) || 1,
            formality: Number(values.formality) || 1,
            clientConfirmKey: `${id}`,
          }),
        });
        if (!res.ok) {
          setErrorNote(
            res.status === 409
              ? "This garment was already confirmed — check your wardrobe."
              : "Confirmation failed — the photo is safe; try again.",
          );
          return;
        }
        setState({ phase: "resolved", garmentId: id });
      } catch {
        setErrorNote("You appear to be offline — the garment is not confirmed yet.");
      }
    },
    [state],
  );

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileBytes(null);
    setErrorNote("");
    setInputKey((k) => k + 1);
    setState({ phase: "idle" });
  }, [previewUrl]);

  const statusLine = useMemo(() => {
    switch (state.phase) {
      case "idle":
        return "Pick or capture one garment photo to begin.";
      case "picked":
        return "Preview looks right? Continue to the consent step and upload.";
      case "uploading":
        return "Uploading privately to image storage…";
      case "analyzing":
        return "Image stored. Preparing your review sheet…";
      case "review_required":
        return "Describe the garment below to finish adding it.";
      case "resolved":
        return "Confirmed and saved — the piece is now in your wardrobe.";
      case "error_retry":
        return state.reason;
    }
  }, [state]);

  return (
    <div className="capture-flow">
      <p className="capture-status" aria-live="polite">
        {statusLine}
      </p>

      {state.phase === "idle" || state.phase === "error_retry" ? (
        <div className="capture-pick">
          <label className="capture-drop">
            <input
              key={inputKey}
              type="file"
              accept={[...UPLOAD_LIMITS.allowedMimeTypes].join(",")}
              capture="environment"
              onChange={(e) => onPick(e.target.files?.[0])}
              className="visually-hidden-input"
            />
            <Camera size={22} aria-hidden="true" />
            <span>Capture or choose an image</span>
            <span className="capture-hint">
              On unsupported browsers this is a normal file picker. JPEG, PNG,
              WebP, HEIC up to 8 MB.
            </span>
          </label>
          {state.phase === "error_retry" ? (
            <p className="capture-error" role="alert">
              {state.reason}{" "}
              <button type="button" className="link-button" onClick={reset}>
                Start over
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {previewUrl && state.phase !== "review_required" && state.phase !== "resolved" ? (
        <div className="capture-preview">
          {/* Local object URL preview; the server-side copy is private. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Local preview of the selected garment" />
          <div className="capture-preview-actions">
            <button type="button" className="btn-secondary" onClick={reset}>
              <RotateCcw size={15} aria-hidden="true" /> Retake
            </button>
            {state.phase === "picked" && consent === "granted" ? (
              <button type="button" className="btn-primary" onClick={() => void grantAndUpload()}>
                <Upload size={15} aria-hidden="true" /> Upload privately
              </button>
            ) : null}
          </div>

          {/* Consent disclosure (§10): shown before any upload; the grant is
              recorded server-side and revocable from the privacy hub. */}
          {state.phase === "picked" && consent !== "granted" ? (
            <motion.section
              className="consent-disclosure"
              aria-labelledby="consent-h"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={atlasSpring(reduced)}
            >
              <h2 id="consent-h">
                <ShieldCheck size={16} aria-hidden="true" /> Before your photo leaves this device
              </h2>
              <ul>
                <li>
                  <strong>Purpose:</strong> storing your garment photo so you can
                  review it and use it in outfit planning.
                </li>
                <li>
                  <strong>Storage:</strong> Cloudinary, private delivery — only
                      you can fetch it, and only through Atlas, with expiring
                      signed links.
                </li>
                <li>
                  <strong>Analysis:</strong> automated tag analysis runs only
                  with this consent, once an analysis provider is configured.
                </li>
                <li>
                  <strong>Control:</strong> delete the photo any time from your
                  wardrobe — deletion includes the stored copy, and revoking
                  consent blocks all future uploads.
                </li>
              </ul>
              <button type="button" className="btn-primary" onClick={() => void grantAndUpload()}>
                Allow and upload this photo
              </button>
              {errorNote ? (
                <p className="capture-error" role="alert">
                  {errorNote}
                </p>
              ) : null}
            </motion.section>
          ) : null}
        </div>
      ) : null}

      {state.phase === "review_required" && state.pending ? (
        <TagReview pending={state.pending} onConfirm={(v) => void confirm(v)} />
      ) : null}

      {state.phase === "resolved" ? (
        <div className="capture-resolved">
          <p>Saved. The photo is stored privately and the garment is ready for outfit planning.</p>
          <div className="capture-preview-actions">
            <Link className="btn-primary" href="/wardrobe">
              Open your wardrobe
            </Link>
            <button type="button" className="btn-secondary" onClick={reset}>
              Add another
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
