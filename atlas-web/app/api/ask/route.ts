import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

/**
 * Ask Atlas — the bounded request path. Deterministic candidate selection from
 * the user's CONFIRMED garments only (product contract §7): formality and
 * warmth are matched against the request, never invented. If nothing in the
 * wardrobe fits, Atlas says so — it does not fabricate pieces the user does
 * not own. No model is required for this path; no side effects occur.
 */

const OCCASION_FORMALITY: [RegExp, number][] = [
  [/\b(formal|gala|wedding|black.?tie|interview)\b/i, 4],
  [/\b(client|business|meeting|conference|office|dinner)\b/i, 3],
  [/\b(coffee|casual|weekend|errand|walk)\b/i, 2],
];

function requiredFormality(prompt: string): number {
  for (const [re, level] of OCCASION_FORMALITY) {
    if (re.test(prompt)) return level;
  }
  return 2;
}

function requiredWarmth(prompt: string): number {
  const cold = /\b(cold|freezing|snow|winter|chilly|18°|1[0-7]°|\b[0-9]\s?°)\b/i.test(prompt);
  const warm = /\b(hot|warm|summer|heat ?wave|2[5-9]°|3[0-9]°)\b/i.test(prompt);
  if (cold) return 2;
  if (warm) return 1;
  return 2; // temperate default: one warm layer
}

export async function POST(request: Request) {
  const principal = await requirePrincipal();
  let body: { prompt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";
  if (!prompt) {
    return NextResponse.json({ error: "missing_prompt" }, { status: 400 });
  }

  const { store, mode } = getStore();
  const garments = await store.listGarments(principal.userId);
  const confirmed = garments.filter((g) => g.status === "confirmed");

  const needF = requiredFormality(prompt);
  const needW = requiredWarmth(prompt);

  // Deterministic pick: closest formality first, then closest warmth.
  const score = (g: (typeof confirmed)[number]) =>
    Math.abs(g.formality - needF) * 2 + Math.abs(g.warmth - needW);

  const tops = confirmed
    .filter((g) => g.category === "top")
    .sort((a, b) => score(a) - score(b));
  const bottoms = confirmed
    .filter((g) => g.category === "bottom")
    .sort((a, b) => score(a) - score(b));
  const outerwear = confirmed
    .filter((g) => g.category === "outerwear")
    .sort((a, b) => score(a) - score(b));
  const shoes = confirmed
    .filter((g) => g.category === "shoes")
    .sort((a, b) => score(a) - score(b));

  // A proposal needs at least a top or a bottom from the real wardrobe.
  if (tops.length === 0 && bottoms.length === 0) {
    return NextResponse.json(
      {
        error: "no_candidate",
        message:
          "No confirmed garments fit this request yet. Confirm garments in your wardrobe first — Atlas only proposes outfits from pieces you own and confirmed.",
        capability: "advise" as const,
      },
      { status: 200 },
    );
  }

  const pieces = [
    tops[0]?.name,
    bottoms[0]?.name,
    outerwear[0]?.name,
    shoes[0]?.name,
  ].filter((n): n is string => Boolean(n));

  const evidence = [
    `${confirmed.length} confirmed wardrobe item${confirmed.length === 1 ? "" : "s"} (server-side store, ${mode})`,
    `Requested formality level ${needF}/4 matched against garment attributes`,
    prompt.match(/\b\d{1,2}\s?°/)
      ? "Temperature context parsed from your request"
      : "Season-default warmth applied",
  ];

  return NextResponse.json({
    capability: "prepare" as const,
    title: `Prepared from your wardrobe for "${prompt.slice(0, 48)}${prompt.length > 48 ? "…" : ""}"`,
    implication:
      "Selected deterministically from confirmed owned garments — model explanation can refine this once a provider is configured.",
    pieces,
    evidence,
    boundaries: [
      "Atlas did not purchase, book, send, or mutate anything.",
      "Pieces shown are yours; nothing was invented.",
    ],
  });
}
