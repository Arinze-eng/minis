"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowRight, Camera, Shirt, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHead, PageLoading, useRun } from "@/components/ui";
import { api } from "@/convex/_generated/api";

const PRESENTATIONS = [
  ["feminine", "Womenswear"],
  ["masculine", "Menswear"],
  ["neutral", "Both"],
] as const;
const FITS = ["slim", "regular", "relaxed", "oversized"] as const;
const STEPS = ["Your style", "Your wardrobe"] as const;

export default function WelcomePage() {
  const me = useQuery(api.users.me);
  const updatePrefs = useMutation(api.users.updatePrefs);
  const complete = useMutation(api.users.completeOnboarding);
  const setConsent = useMutation(api.consent.set);
  const addSamples = useAction(api.samples.add);
  const router = useRouter();
  const { run, busy } = useRun();
  const [step, setStep] = useState<0 | 1>(0);
  const [city, setCity] = useState<string | null>(null);

  if (!me) return <PageLoading />;
  const prefs = me.prefs;
  const finish = async (to: string, before?: () => Promise<unknown>) => {
    const ok = await run(async () => {
      await before?.();
      await complete({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      return true;
    });
    if (ok !== undefined) router.replace(to);
  };

  return (
    <div className="page max-w-4xl">
      <PageHead
        eyebrow={`Step ${step + 1} of ${STEPS.length}`}
        title={step === 0 ? "Set your style." : "Fill your wardrobe."}
        sub={step === 0 ? "The stylist dresses you to these. Change them any time in Settings." : "Pick how to start. You can do the others later."}
      />
      <ol className="stepper" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <span className="tile-kicker">0{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="stack-md">
          <div className="field">
            <span className="field-label">I mostly wear</span>
            <div className="segmented" role="radiogroup" aria-label="Style presentation">
              {PRESENTATIONS.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={prefs.presentation === v} disabled={busy} onClick={() => run(() => updatePrefs({ patch: { presentation: v } }))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Preferred fit</span>
            <div className="segmented" role="radiogroup" aria-label="Preferred fit">
              {FITS.map((v) => (
                <button key={v} type="button" role="radio" aria-checked={prefs.fit === v} disabled={busy} onClick={() => run(() => updatePrefs({ patch: { fit: v } }))} className="capitalize">
                  {v}
                </button>
              ))}
            </div>
          </div>
          <label className="field max-w-sm">
            <span className="field-label">Home city (for weather)</span>
            <input className="input" value={city ?? prefs.homeCity ?? ""} onChange={(e) => setCity(e.target.value)} placeholder="London" maxLength={80} />
          </label>
          <div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                const ok = city !== null ? await run(() => updatePrefs({ patch: { homeCity: city.trim() || undefined } })) : true;
                if (ok !== undefined) setStep(1);
              }}
            >
              Continue <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="choice-grid">
          <button
            type="button"
            className="choice"
            disabled={busy}
            onClick={() => finish("/wardrobe/add", () => setConsent({ scope: "garment_image_analysis", granted: true }))}
          >
            <Camera size={22} aria-hidden="true" />
            <span className="choice-title">Photograph your clothes</span>
            <span className="choice-body">A pile on the bed works. Atlas finds each piece, cuts it out and tags it. Photos go only to Amazon Bedrock or Groq — never to free tiers that train on data.</span>
            <span className="kicker">Recommended</span>
          </button>
          <button type="button" className="choice" disabled={busy} onClick={() => finish("/wardrobe", () => addSamples({}))}>
            <Shirt size={22} aria-hidden="true" />
            <span className="choice-title">Start with a sample wardrobe</span>
            <span className="choice-body">Twelve illustrated basics to try the stylist, looks and trip packing straight away. Remove them whenever you like.</span>
            <span className="kicker">No photos needed</span>
          </button>
          <button type="button" className="choice" disabled={busy} onClick={() => finish("/sources")}>
            <Sparkles size={22} aria-hidden="true" />
            <span className="choice-title">Find purchases in Gmail</span>
            <span className="choice-body">Read-only, headers only. Atlas spots clothing receipts and subscriptions, and never sends or deletes mail.</span>
            <span className="kicker">Optional</span>
          </button>
          <div className="col-span-full flex gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => finish("/inbox")}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
