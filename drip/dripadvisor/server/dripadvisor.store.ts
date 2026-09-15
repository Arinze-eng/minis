import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { storeImage } from "./assets";
import { outfitFeedback, outfitPlans, wardrobeItems, type InsertOutfitPlan, type InsertWardrobeItem } from "../drizzle/schema";
import { createNeonFeedback, createNeonGarment, createNeonOutfit, deleteNeonGarment, listNeonGarments, listNeonOutfits, neonConfigured } from "./neon";

export type StoreGarment = {
  id: number;
  name: string;
  category: string;
  colors: string[];
  pattern?: string | null;
  material?: string | null;
  warmth: number;
  formality: number;
  imageUrl?: string | null;
  status: string;
  analysisProvider: string;
};

export type StoreOutfit = {
  id: number;
  requestText: string;
  title: string;
  note: string;
  itemIds: number[];
  score: number;
  provider: string;
  previewUrl?: string | null;
  previewStatus: string;
};

const demoGarments: StoreGarment[] = [
  { id: 1, name: "Boxy Oxford", category: "top", colors: ["soft blue"], warmth: 1, formality: 2, status: "confirmed", analysisProvider: "seed" },
  { id: 2, name: "Pleated Trouser", category: "bottom", colors: ["charcoal"], warmth: 1, formality: 2, status: "confirmed", analysisProvider: "seed" },
  { id: 3, name: "Utility Overshirt", category: "outerwear", colors: ["olive"], warmth: 2, formality: 1, status: "confirmed", analysisProvider: "seed" },
  { id: 4, name: "Retro Runner", category: "shoes", colors: ["cream", "green"], warmth: 0, formality: 1, status: "confirmed", analysisProvider: "seed" },
  { id: 5, name: "Merino Knit", category: "top", colors: ["warm sand"], warmth: 2, formality: 2, status: "confirmed", analysisProvider: "seed" },
  { id: 6, name: "Straight Denim", category: "bottom", colors: ["washed indigo"], warmth: 1, formality: 1, status: "confirmed", analysisProvider: "seed" },
  { id: 7, name: "Rain Shell", category: "outerwear", colors: ["ink black"], warmth: 3, formality: 1, status: "confirmed", analysisProvider: "seed" },
  { id: 8, name: "Canvas High", category: "shoes", colors: ["off white"], warmth: 0, formality: 1, status: "confirmed", analysisProvider: "seed" },
];

const memory = {
  nextGarmentId: 9,
  nextOutfitId: 1,
  garments: [...demoGarments],
  outfits: [] as StoreOutfit[],
};

function parseColors(value: string | null | undefined): string[] {
  if (!value) return [];
  try { return JSON.parse(value) as string[]; } catch { return value.split(",").map((part) => part.trim()).filter(Boolean); }
}

function toGarment(row: typeof wardrobeItems.$inferSelect): StoreGarment {
  return { id: row.id, name: row.name, category: row.category, colors: parseColors(row.colors), pattern: row.pattern, material: row.material, warmth: row.warmth, formality: row.formality, imageUrl: row.imageUrl, status: row.status, analysisProvider: row.analysisProvider };
}

function toOutfit(row: typeof outfitPlans.$inferSelect): StoreOutfit {
  return { id: row.id, requestText: row.requestText, title: row.title, note: row.note, itemIds: parseColors(row.itemIds).map(Number), score: row.score, provider: row.provider, previewUrl: row.previewUrl, previewStatus: row.previewStatus };
}

async function dbOrNull() {
  try { return await getDb(); } catch { return null; }
}

export async function listGarments(ownerUserId = 0): Promise<StoreGarment[]> {
  if (neonConfigured()) {
    try {
      const rows = await listNeonGarments(ownerUserId);
      if (rows?.length) return rows;
      if (ownerUserId === 0) return [...memory.garments];
    } catch (error) { console.warn("[Store] Falling back from Neon wardrobe:", error); }
  }
  const db = await dbOrNull();
  if (!db) return [...memory.garments];
  try {
    const rows = await db.select().from(wardrobeItems).where(eq(wardrobeItems.ownerUserId, ownerUserId)).orderBy(desc(wardrobeItems.createdAt));
    if (rows.length === 0 && ownerUserId === 0) return [...memory.garments];
    return rows.map(toGarment);
  } catch (error) { console.warn("[Store] Falling back to local wardrobe:", error); return [...memory.garments]; }
}

export async function createGarment(input: Omit<StoreGarment, "id" | "imageUrl" | "status"> & { imageDataUrl?: string; status?: string }, ownerUserId = 0): Promise<StoreGarment> {
  let imageUrl: string | undefined;
  let imageKey: string | undefined;
  if (input.imageDataUrl?.startsWith("data:")) {
    const match = input.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const buffer = Buffer.from(match[2], "base64");
      const stored = await storeImage(`wardrobe/${ownerUserId}/${Date.now()}-${input.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.bin`, buffer, match[1]);
      imageUrl = stored.url;
      imageKey = stored.key;
    }
  }
  const db = await dbOrNull();
  const values: InsertWardrobeItem = {
    ownerUserId,
    name: input.name,
    category: input.category,
    colors: JSON.stringify(input.colors),
    pattern: input.pattern ?? null,
    material: input.material ?? null,
    warmth: input.warmth,
    formality: input.formality,
    imageUrl: imageUrl ?? null,
    imageKey: imageKey ?? null,
    analysisProvider: input.analysisProvider,
    status: input.status ?? "confirmed",
  };
  if (neonConfigured()) {
    try {
      const neonItem = await createNeonGarment({ ownerUserId, name: input.name, category: input.category, colors: input.colors, pattern: input.pattern, material: input.material, warmth: input.warmth, formality: input.formality, imageUrl, imageKey, analysisProvider: input.analysisProvider, status: input.status ?? "confirmed" });
      if (neonItem) return neonItem;
    } catch (error) { console.warn("[Store] Falling back from Neon garment create:", error); }
  }
  if (db) {
    try {
      const result = await db.insert(wardrobeItems).values(values);
      const id = Number(result[0].insertId);
      const rows = await db.select().from(wardrobeItems).where(eq(wardrobeItems.id, id)).limit(1);
      if (rows[0]) return toGarment(rows[0]);
    } catch (error) { console.warn("[Store] Falling back to local garment create:", error); }
  }
  const garment: StoreGarment = { id: memory.nextGarmentId++, name: input.name, category: input.category, colors: input.colors, pattern: input.pattern, material: input.material, warmth: input.warmth, formality: input.formality, imageUrl, status: input.status ?? "confirmed", analysisProvider: input.analysisProvider };
  memory.garments.unshift(garment);
  return garment;
}

export async function deleteGarment(id: number, ownerUserId = 0): Promise<boolean> {
  if (neonConfigured()) {
    try {
      const result = await deleteNeonGarment(id, ownerUserId);
      if (result !== null) return result;
    } catch (error) { console.warn("[Store] Falling back from Neon garment delete:", error); }
  }
  const db = await dbOrNull();
  if (db) {
    try { await db.delete(wardrobeItems).where(eq(wardrobeItems.id, id)); return true; } catch (error) { console.warn("[Store] Falling back to local garment delete:", error); }
  }
  const before = memory.garments.length;
  memory.garments = memory.garments.filter((item) => item.id !== id);
  return memory.garments.length < before;
}

export async function saveOutfit(input: Omit<StoreOutfit, "id" | "previewUrl" | "previewStatus">, ownerUserId = 0): Promise<StoreOutfit> {
  if (neonConfigured()) {
    try {
      const neonOutfit = await createNeonOutfit({ ownerUserId, requestText: input.requestText, title: input.title, note: input.note, itemIds: input.itemIds, score: input.score, provider: input.provider });
      if (neonOutfit) return neonOutfit;
    } catch (error) { console.warn("[Store] Falling back from Neon outfit create:", error); }
  }
  const db = await dbOrNull();
  const values: InsertOutfitPlan = { ownerUserId, requestText: input.requestText, title: input.title, note: input.note, itemIds: JSON.stringify(input.itemIds), score: input.score, provider: input.provider, previewStatus: "none" };
  if (db) {
    try {
      const result = await db.insert(outfitPlans).values(values);
      const id = Number(result[0].insertId);
      const rows = await db.select().from(outfitPlans).where(eq(outfitPlans.id, id)).limit(1);
      if (rows[0]) return toOutfit(rows[0]);
    } catch (error) { console.warn("[Store] Falling back to local outfit create:", error); }
  }
  const outfit: StoreOutfit = { id: memory.nextOutfitId++, ...input, previewStatus: "none" };
  memory.outfits.unshift(outfit);
  return outfit;
}

export async function listOutfits(ownerUserId = 0): Promise<StoreOutfit[]> {
  if (neonConfigured()) {
    try {
      const rows = await listNeonOutfits(ownerUserId);
      if (rows) return rows;
    } catch (error) { console.warn("[Store] Falling back from Neon outfit list:", error); }
  }
  const db = await dbOrNull();
  if (!db) return [...memory.outfits];
  try {
    const rows = await db.select().from(outfitPlans).where(eq(outfitPlans.ownerUserId, ownerUserId)).orderBy(desc(outfitPlans.createdAt));
    return rows.map(toOutfit);
  } catch { return [...memory.outfits]; }
}

export async function addFeedback(input: { outfitId: number; decision: string; reason?: string }, ownerUserId = 0): Promise<void> {
  if (neonConfigured()) {
    try {
      const result = await createNeonFeedback({ ownerUserId, ...input });
      if (result !== null) return;
    } catch (error) { console.warn("[Store] Falling back from Neon feedback:", error); }
  }
  const db = await dbOrNull();
  if (db) {
    try { await db.insert(outfitFeedback).values({ ownerUserId, outfitId: input.outfitId, decision: input.decision, reason: input.reason ?? null }); return; } catch (error) { console.warn("[Store] Feedback stored only in memory:", error); }
  }
}
