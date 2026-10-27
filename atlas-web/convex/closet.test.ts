import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { packFor, pickOutfit } from "./model/pack";
import schema, { USER_TABLES } from "./schema";
import { USER_INDEX } from "./privacy";
import { setup } from "./test.setup";

const ALICE = { subject: "user_alice", email: "alice@example.test", name: "Alice" };
const BOB = { subject: "user_bob", email: "bob@example.test", name: "Bob" };

type T = ReturnType<typeof setup>;

async function addItem(t: T, userId: Id<"users">, patch: Partial<Doc<"items">> = {}): Promise<Id<"items">> {
  return t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      name: "Navy tee",
      category: "top",
      subcategory: "t-shirt",
      colours: { primary: "navy", secondary: [], hex: ["#1f2a44"] },
      pattern: "solid",
      material: "cotton",
      seasons: ["spring", "summer"],
      formality: "casual",
      description: "",
      status: "ready",
      laundry: "clean",
      wearCount: 0,
      analysisProvider: "test",
      searchText: "navy tee",
      createdAt: 1,
      updatedAt: 1,
      ...patch,
    }),
  );
}

describe("schema coverage", () => {
  it("purges every table that holds a userId", () => {
    const owned = Object.entries(schema.tables)
      .filter(([, table]) => "userId" in (table.validator as { fields: Record<string, unknown> }).fields)
      .map(([name]) => name)
      .filter((name) => name !== "users");
    expect([...USER_TABLES].sort()).toEqual(owned.sort());
    for (const table of USER_TABLES) expect(USER_INDEX[table], table).toBeTruthy();
  });
});

describe("outfits", () => {
  it("rejects foreign, unready and miscategorised pieces", async () => {
    const t = setup();
    const alice = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const bob = await t.withIdentity(BOB).mutation(api.users.ensure, {});
    const top = await addItem(t, alice);
    const bobsTop = await addItem(t, bob);
    const unready = await addItem(t, alice, { status: "extracting" });
    const asAlice = t.withIdentity(ALICE);

    await expect(asAlice.mutation(api.outfits.create, { name: "x", slots: { top: bobsTop, accessories: [] } })).rejects.toThrow(/not in your wardrobe/);
    await expect(asAlice.mutation(api.outfits.create, { name: "x", slots: { top: unready, accessories: [] } })).rejects.toThrow(/isn't ready/);
    await expect(asAlice.mutation(api.outfits.create, { name: "x", slots: { bottom: top, accessories: [] } })).rejects.toThrow(/not bottom/);
    await expect(asAlice.mutation(api.outfits.create, { name: "x", slots: { accessories: [] } })).rejects.toThrow(/at least one piece/);

    const id = await asAlice.mutation(api.outfits.create, { name: "Easy", slots: { top, accessories: [] } });
    expect((await asAlice.query(api.outfits.list, {})).map((o) => o._id)).toEqual([id]);
    expect(await t.withIdentity(BOB).query(api.outfits.get, { outfitId: id })).toBeNull();
  });

  it("logs a wear once per idempotency key", async () => {
    const t = setup();
    const alice = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const top = await addItem(t, alice);
    const asAlice = t.withIdentity(ALICE);
    expect(await asAlice.mutation(api.items.markWorn, { itemIds: [top], idempotencyKey: "k1" })).toEqual({ duplicate: false });
    expect(await asAlice.mutation(api.items.markWorn, { itemIds: [top], idempotencyKey: "k1" })).toEqual({ duplicate: true });
    const item = await t.run((ctx) => ctx.db.get(top));
    expect(item).toMatchObject({ wearCount: 1, laundry: "worn" });
  });
});

describe("stylist tools", () => {
  it("returns problems for invented ids instead of saving them", async () => {
    const t = setup();
    const alice = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const top = await addItem(t, alice);
    const threadId = await t.run((ctx) => ctx.db.insert("threads", { userId: alice, title: "t", busy: true, lastMessageAt: 1, createdAt: 1 }));

    const bad = await t.mutation(internal.stylist.toolPropose, { threadId, name: "x", reasoning: "r", slots: { top: "item_123" } });
    expect(bad.outfitId).toBeUndefined();
    expect(bad.problems[0]).toMatch(/not an item id/);

    const good = await t.mutation(internal.stylist.toolPropose, { threadId, name: "Look", reasoning: "r", slots: { top } });
    expect(good.problems).toEqual([]);
    // Proposals stay out of the saved list until the user saves them.
    expect(await t.withIdentity(ALICE).query(api.outfits.list, {})).toEqual([]);
  });

  it("can only ask for a try-on; the user's decision is what runs it", async () => {
    const t = setup();
    const alice = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.withIdentity(BOB).mutation(api.users.ensure, {});
    const top = await addItem(t, alice);
    const outfitId = await t.withIdentity(ALICE).mutation(api.outfits.create, { name: "Look", slots: { top, accessories: [] } });
    const threadId = await t.run((ctx) => ctx.db.insert("threads", { userId: alice, title: "t", busy: false, lastMessageAt: 1, createdAt: 1 }));

    const { approvalId } = await t.mutation(internal.stylist.toolRequestTryOn, { threadId, outfitId });
    expect(approvalId).toBeDefined();
    expect(await t.run((ctx) => ctx.db.query("renders").collect())).toEqual([]);
    await expect(t.withIdentity(BOB).mutation(api.approvals.decide, { approvalId: approvalId!, approve: true })).rejects.toThrow(/doesn't exist/);
    expect(await t.withIdentity(ALICE).mutation(api.approvals.decide, { approvalId: approvalId!, approve: false })).toEqual({ status: "rejected" });
  });
});

describe("shared try-ons", () => {
  it("expire, and disappear when photo consent is withdrawn", async () => {
    vi.useFakeTimers();
    const t = setup();
    const alice = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const asAlice = t.withIdentity(ALICE);
    await asAlice.mutation(api.consent.set, { scope: "person_image_use", granted: true });
    const top = await addItem(t, alice);
    const outfitId = await asAlice.mutation(api.outfits.create, { name: "Look", slots: { top, accessories: [] } });
    const renderId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["png"]));
      const avatarId = await ctx.db.insert("avatars", { userId: alice, storageId, label: "me", createdAt: 1 });
      const jobId = await ctx.db.insert("jobs", { userId: alice, type: "tryon", status: "done", steps: [], progress: 1, createdAt: 1, updatedAt: 1 });
      return ctx.db.insert("renders", { userId: alice, outfitId, avatarId, jobId, status: "done", storageId, createdAt: 1 });
    });

    const token = await asAlice.mutation(api.renders.share, { renderId });
    expect(await t.query(api.renders.shared, { token })).toMatchObject({ outfitName: "Look" });

    await asAlice.mutation(api.consent.set, { scope: "person_image_use", granted: false });
    expect(await t.query(api.renders.shared, { token })).toBeNull();

    await asAlice.mutation(api.consent.set, { scope: "person_image_use", granted: true });
    vi.advanceTimersByTime(8 * 86_400_000);
    expect(await t.query(api.renders.shared, { token })).toBeNull();
    vi.useRealTimers();
  });
});

describe("packing and morning picks", () => {
  const item = (id: string, category: Doc<"items">["category"], extra: Partial<Doc<"items">> = {}) =>
    ({ _id: id as Id<"items">, name: id, category, seasons: [], laundry: "clean", wearCount: 0, colours: { primary: "", secondary: [], hex: [] }, ...extra }) as Doc<"items">;

  it("prefers clean, least recently worn pieces and adds a layer when it's cold", () => {
    const items = [
      item("tee-worn", "top", { laundry: "worn" }),
      item("tee-old", "top", { lastWornAt: 1 }),
      item("tee-new", "top", { lastWornAt: 9 }),
      item("jeans", "bottom"),
      item("boots", "shoes"),
      item("coat", "outerwear"),
    ];
    const warm = pickOutfit(items, { maxC: 26, minC: 18, rainChance: 0 });
    expect(warm).toMatchObject({ complete: true, slots: { top: "tee-old", bottom: "jeans", shoes: "boots", outerwear: undefined } });
    expect(pickOutfit(items, { maxC: 9, minC: 2, rainChance: 0 }).slots.outerwear).toBe("coat");
  });

  it("reports what the wardrobe is missing for a trip", () => {
    const { itemIds, gaps } = packFor([item("tee", "top"), item("boots", "shoes")], [{ date: "2026-01-01", maxC: 8, minC: 1, rainChance: 70 }], 4);
    expect(itemIds).toEqual(["tee", "boots"]);
    expect(gaps.join(" ")).toMatch(/top/);
    expect(gaps.join(" ")).toMatch(/bottom/);
    expect(gaps.join(" ")).toMatch(/outerwear/);
  });
});

describe("job errors", () => {
  it("shows the app error message, not the raw worker string", async () => {
    const { readableError } = await import("./model/jobs");
    expect(readableError('Uncaught ConvexError: {"code":"CONFLICT","message":"No AI provider is set up for this yet."}\n    at handler')).toBe(
      "No AI provider is set up for this yet.",
    );
    expect(readableError("Uncaught Error: Couldn't read that photo")).toBe("Couldn't read that photo");
  });
});

describe("gap analysis", () => {
  it("names concrete gaps instead of guessing", async () => {
    const { summariseGaps } = await import("./model/gaps");
    const piece = (category: Doc<"items">["category"], extra: Partial<Doc<"items">> = {}) =>
      ({ category, seasons: ["summer"], formality: "casual", colours: { primary: "navy", secondary: [], hex: [] }, ...extra }) as Doc<"items">;
    expect(summariseGaps([]).gaps).toEqual(["the wardrobe is empty"]);
    const gaps = summariseGaps([piece("top"), piece("bottom"), piece("outerwear")]).gaps;
    expect(gaps).toEqual(expect.arrayContaining(["no shoes", "no outerwear for winter", "nothing formal"]));
    expect(gaps).not.toContain("no outerwear");
  });
});

describe("Google sign-in linking", () => {
  it("links granted sources once, and never re-links one the user disconnected", async () => {
    const t = setup();
    const alice = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    expect(await t.mutation(internal.sources.linkViaClerk, { userId: alice, providers: ["gmail"] })).toEqual(["gmail"]);
    const consent = await t.run((ctx) => ctx.db.query("consentGrants").collect());
    expect(consent.find((c) => c.scope === "gmail_read")?.granted).toBe(true);

    await t.mutation(internal.sources.deleteSourceData, { userId: alice, provider: "gmail", revokedAtGoogle: false });
    expect(await t.mutation(internal.sources.linkViaClerk, { userId: alice, providers: ["gmail"] })).toEqual([]);

    await t.withIdentity(ALICE).mutation(api.sources.allowAutoConnect, { provider: "gmail" });
    expect(await t.mutation(internal.sources.linkViaClerk, { userId: alice, providers: ["gmail"] })).toEqual(["gmail"]);
  });
});
