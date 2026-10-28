import type { Doc } from "../_generated/dataModel";

type Attributes = Pick<Doc<"items">, "name" | "category" | "subcategory" | "colours" | "pattern" | "material" | "seasons" | "formality" | "description">;
export type Sample = Attributes & { key: string; for: ("feminine" | "masculine" | "neutral")[]; svg: string };

const EDGE = 'stroke="rgba(0,0,0,.28)" stroke-width="4" stroke-linejoin="round"';
const LINE = 'fill="none" stroke="rgba(0,0,0,.22)" stroke-width="4" stroke-linecap="round"';

/** Flat garment illustration on a transparent 400×400 canvas. */
function art(fill: string, body: string, details = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><g fill="${fill}" ${EDGE}>${body}</g>${details}</svg>`;
}
const p = (d: string) => `<path d="${d}"/>`;
const l = (d: string) => `<path d="${d}" ${LINE}/>`;

const TEE = "M150 70 L110 84 L58 132 L92 172 L122 150 L122 332 L278 332 L278 150 L308 172 L342 132 L290 84 L250 70 Q200 108 150 70 Z";
const LONG = "M152 64 L110 80 L74 122 L52 300 L88 306 L114 168 L116 336 L284 336 L286 168 L312 306 L348 300 L326 122 L290 80 L248 64 L200 98 Z";
const COAT = "M150 54 L106 72 L72 116 L50 318 L88 324 L112 170 L110 364 L290 364 L288 170 L312 324 L350 318 L328 116 L294 72 L250 54 L200 112 Z";
const TROUSERS = "M128 48 L272 48 L288 352 L222 352 L200 156 L178 352 L112 352 Z";
const SKIRT = "M142 78 L258 78 L312 322 L88 322 Z";
const DRESS = "M160 48 L180 48 Q200 76 220 48 L240 48 L256 128 L240 168 L322 352 L78 352 L160 168 L144 128 Z";
const SNEAKER = "M58 262 L60 206 Q72 174 112 180 L178 194 Q228 162 270 204 L332 228 Q352 238 346 262 L344 276 L58 276 Z";
const BOOT = "M138 76 L222 76 L226 228 L300 254 Q332 266 330 296 L330 318 L138 318 Z";
const TOTE = "M96 158 L304 158 L324 342 L76 342 Z";
const CAP = "M112 232 Q112 132 208 132 Q298 132 300 232 Z";

const base = { pattern: "solid", description: "" };

export const SAMPLES: Sample[] = [
  { key: "tee", for: ["feminine", "masculine", "neutral"], name: "White cotton tee", category: "top", subcategory: "t-shirt", colours: { primary: "white", secondary: [], hex: ["#f4f2ee"] }, material: "cotton", seasons: ["spring", "summer"], formality: "casual", ...base, svg: art("#f4f2ee", p(TEE), l("M168 82 Q200 104 232 82")) },
  { key: "oxford", for: ["feminine", "masculine", "neutral"], name: "Blue oxford shirt", category: "top", subcategory: "shirt", colours: { primary: "light blue", secondary: [], hex: ["#9db7d5"] }, material: "cotton", seasons: ["spring", "autumn"], formality: "smart-casual", ...base, svg: art("#9db7d5", p(LONG), l("M200 98 L200 330") + l("M168 70 L200 110 L232 70")) },
  { key: "knit", for: ["feminine", "masculine", "neutral"], name: "Grey merino crewneck", category: "top", subcategory: "jumper", colours: { primary: "grey", secondary: [], hex: ["#8e9196"] }, material: "wool", seasons: ["autumn", "winter"], formality: "smart-casual", ...base, svg: art("#8e9196", p(LONG), l("M122 316 L278 316") + l("M170 74 Q200 96 230 74")) },
  { key: "coat", for: ["feminine", "masculine", "neutral"], name: "Camel wool coat", category: "outerwear", subcategory: "overcoat", colours: { primary: "camel", secondary: [], hex: ["#b88a5a"] }, material: "wool", seasons: ["autumn", "winter"], formality: "smart-casual", ...base, svg: art("#b88a5a", p(COAT), l("M200 112 L200 360") + l("M150 54 L178 170 L200 112 L222 170 L250 54")) },
  { key: "jeans", for: ["feminine", "masculine", "neutral"], name: "Indigo straight jeans", category: "bottom", subcategory: "jeans", colours: { primary: "indigo", secondary: [], hex: ["#34466b"] }, material: "denim", seasons: ["spring", "autumn", "winter"], formality: "casual", ...base, svg: art("#34466b", p(TROUSERS), l("M130 76 L270 76") + l("M200 76 L200 156")) },
  { key: "chinos", for: ["masculine", "neutral"], name: "Stone chinos", category: "bottom", subcategory: "chinos", colours: { primary: "stone", secondary: [], hex: ["#cbbd9f"] }, material: "cotton twill", seasons: ["spring", "summer", "autumn"], formality: "smart-casual", ...base, svg: art("#cbbd9f", p(TROUSERS), l("M130 76 L270 76")) },
  { key: "skirt", for: ["feminine", "neutral"], name: "Black midi skirt", category: "bottom", subcategory: "midi skirt", colours: { primary: "black", secondary: [], hex: ["#26262a"] }, material: "crepe", seasons: ["spring", "autumn", "winter"], formality: "smart-casual", ...base, svg: art("#26262a", p(SKIRT), l("M146 102 L254 102")) },
  { key: "dress", for: ["feminine", "neutral"], name: "Sage slip dress", category: "dress", subcategory: "slip dress", colours: { primary: "sage", secondary: [], hex: ["#9fae95"] }, material: "satin", seasons: ["spring", "summer"], formality: "smart-casual", ...base, svg: art("#9fae95", p(DRESS), l("M152 168 L248 168")) },
  { key: "sneakers", for: ["feminine", "masculine", "neutral"], name: "White leather trainers", category: "shoes", subcategory: "trainers", colours: { primary: "white", secondary: [], hex: ["#f1efea"] }, material: "leather", seasons: ["spring", "summer", "autumn"], formality: "casual", ...base, svg: art("#f1efea", p(SNEAKER), l("M60 262 L344 262") + l("M150 200 L170 230 M180 196 L196 224")) },
  { key: "boots", for: ["feminine", "masculine", "neutral"], name: "Brown Chelsea boots", category: "shoes", subcategory: "chelsea boots", colours: { primary: "brown", secondary: [], hex: ["#6b4630"] }, material: "suede", seasons: ["autumn", "winter"], formality: "smart-casual", ...base, svg: art("#6b4630", p(BOOT), l("M140 300 L328 300") + l("M200 90 L200 200")) },
  { key: "tote", for: ["feminine", "masculine", "neutral"], name: "Black leather tote", category: "bag", subcategory: "tote", colours: { primary: "black", secondary: [], hex: ["#2a2a2e"] }, material: "leather", seasons: ["spring", "summer", "autumn", "winter"], formality: "smart-casual", ...base, svg: art("#2a2a2e", p(TOTE), `<path d="M150 158 Q150 86 200 86 Q250 86 250 158" fill="none" stroke="#2a2a2e" stroke-width="10" stroke-linecap="round"/>`) },
  { key: "cap", for: ["masculine", "neutral"], name: "Navy baseball cap", category: "headwear", subcategory: "cap", colours: { primary: "navy", secondary: [], hex: ["#27324f"] }, material: "cotton", seasons: ["spring", "summer"], formality: "casual", ...base, svg: art("#27324f", p(CAP) + p("M292 226 L372 242 Q362 258 292 252 Z"), l("M206 134 L206 232")) },
];

export function samplesFor(presentation: string): Sample[] {
  const who = presentation === "feminine" || presentation === "masculine" ? presentation : "neutral";
  return SAMPLES.filter((s) => s.for.includes(who));
}
