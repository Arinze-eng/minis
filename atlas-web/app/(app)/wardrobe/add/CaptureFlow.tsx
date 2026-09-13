"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Camera, RotateCcw, Upload } from "lucide-react";
import {
  validateUpload,
  UPLOAD_LIMITS,
  type PendingConfirmation,
  type UploadState,
} from "@/lib/wardrobe";

/**
 * Garment capture flow — frontend projection of the documented server flow:
 * pick → validate → (live: signed upload + consent-gated analysis) →
 * review_required → user confirms → resolved. In demo mode the analysis step
 * is simulated and labelled; no image leaves the device.
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
  onConfirm: (finalName: string) => void;
}) {
  const { garment, suggestedTags } = pending;
  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [field, tag] of Object.entries(suggestedTags)) {
      initial[field] = tag.value;
    }
    return initial;
  });

  const confirmedFields = useRef<Set<string>>(new Set());

  const setValue = useCallback((field: string, value: string) => {
    confirmedFields.current.add(field); // user touched it → user-confirmed provenance
    setEdits((prev) => ({ ...prev, [field]: value }));
  }, []);

  return (
    <section className="tag-review" aria-labelledby="tag-review-h">
      <h2 id="tag-review-h">Review suggested tags</h2>
      <p className="tag-review-note">
        Suggestions come from an analysis model. Everything here is editable —
        your edits override the model and are recorded as user-confirmed.
      </p>

      <div className="tag-grid">
        <label className="tag-field">
          <span>Name</span>
          <input
            type="text"
            value={edits["name"] ?? garment.name}
            onChange={(e) => setValue("name", e.target.value)}
          />
        </label>

        <label className="tag-field">
          <span>Category</span>
          <select
            value={edits["category"] ?? garment.category}
            onChange={(e) => setValue("category", e.target.value)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="tag-field">
          <span>Colors (comma-separated)</span>
          <input
            type="text"
            value={edits["colors"] ?? garment.colors.join(", ")}
            onChange={(e) => setValue("colors", e.target.value)}
          />
        </label>

        <label className="tag-field">
          <span>Material</span>
          <input
            type="text"
            value={edits["material"] ?? ""}
            onChange={(e) => setValue("material", e.target.value)}
            placeholder="e.g. cotton twill"
          />
        </label>

        <label className="tag-field">
          <span>Warmth (0–3)</span>
          <input
            type="number"
            min={0}
            max={3}
            value={edits["warmth"] ?? String(garment.warmth)}
            onChange={(e) => setValue("warmth", e.target.value)}
          />
        </label>

        <label className="tag-field">
          <span>Formality (0–3)</span>
          <input
            type="number"
            min={0}
            max={3}
            value={edits["formality"] ?? String(garment.formality)}
            onChange={(e) => setValue("formality", e.target.value)}
          />
        </label>
      </div>

      <div className="confidence-list" aria-label="Model confidence per tag">
        {Object.entries(suggestedTags).map(([field, tag]) => (
          <span
            key={field}
            className="confidence-pill"
            title={`Model confidence for ${field}`}
          >
            {field}: {Math.round(tag.confidence * 100)}%
          </span>
        ))}
      </div>

      <div className="tag-review-actions">
        <button type="button" className="btn-primary" onClick={() => onConfirm(edits["name"] ?? garment.name)}>
          Confirm garment tags
        </button>
        <button type="button" className="btn-secondary" onClick={() => onConfirm("")}>
          Discard
        </button>
      </div>
      <p className="tag-review-footnote">
        Confirming marks the model-vs-user provenance for each field and makes
        the piece usable by outfit planning.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputKey, setInputKey] = useState(0);

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
      setState({ phase: "picked", fileName: file.name, sizeBytes: file.size, mimeType: file.type });
    },
    [],
  );

  const startAnalysis = useCallback(() => {
    if (state.phase !== "picked") return;
    setState({ phase: "uploading", fileName: state.fileName, progress: 100 });
    // Demo mode: simulated analysis, clearly not a live provider call.
    window.setTimeout(() => setState({ phase: "analyzing", fileName: state.fileName }), 250);
    window.setTimeout(() => {
      setState({
        phase: "review_required",
        pending: {
          garment: {
            id: `demo-upload-${Date.now()}`,
            name: "New wardrobe piece",
            category: "top",
            colors: [],
            warmth: 1,
            formality: 1,
            seasons: [],
            occasions: [],
            wearCount: 0,
            status: "needs_confirmation",
            analysisProvider: "demo",
            imageAlt: "Uploaded garment capture pending review",
            addedAt: new Date().toISOString(),
            correctionHistory: [],
          },
          suggestedTags: {
            name: { value: "New wardrobe piece", confidence: 0.4, provenance: "model_suggested" },
            category: { value: "top", confidence: 0.35, provenance: "model_suggested" },
          },
        },
      });
    }, 1100);
  }, [state]);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setInputKey((k) => k + 1);
    setState({ phase: "idle" });
  }, [previewUrl]);

  const statusLine = useMemo(() => {
    switch (state.phase) {
      case "idle":
        return "Pick or capture one garment photo to begin.";
      case "picked":
        return "Ready — start the (simulated) analysis when the preview looks right.";
      case "uploading":
        return "Validating and staging locally (demo: no upload happens).";
      case "analyzing":
        return "Analyzing for suggested tags (demo simulation — nothing sent).";
      case "review_required":
        return "Review the suggested tags below.";
      case "resolved":
        return "Confirmed (demo): the piece would now join outfit planning.";
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
              ref={inputRef}
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
          {/* Local object URL preview only; never uploaded in demo mode. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Local preview of the selected garment" />
          <div className="capture-preview-actions">
            <button type="button" className="btn-secondary" onClick={reset}>
              <RotateCcw size={15} aria-hidden="true" /> Retake
            </button>
            {state.phase === "picked" ? (
              <button type="button" className="btn-primary" onClick={startAnalysis}>
                <Upload size={15} aria-hidden="true" /> Analyze this garment
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.phase === "review_required" && state.pending ? (
        <TagReview
          pending={state.pending}
          onConfirm={(finalName) => {
            if (!finalName) {
              reset();
              return;
            }
            setState({ phase: "resolved", garmentId: state.pending.garment.id });
          }}
        />
      ) : null}

      {state.phase === "resolved" ? (
        <div className="capture-resolved">
          <p>Tags confirmed. In the connected flow this writes server-side with your provenance recorded.</p>
          <button type="button" className="btn-secondary" onClick={reset}>
            Add another
          </button>
        </div>
      ) : null}
    </div>
  );
}
