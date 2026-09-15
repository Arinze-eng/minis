import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Local-file backend tests: the same interface the Postgres backend implements,
 * pinned for principal isolation, ownership predicates, idempotency, and wipe.
 * (Postgres behavior is verified against a real branch per the runbook.)
 */

let dir: string;
beforeAll(() => {
  // Tests must NEVER touch a real database: force the local backend even if
  // the ambient environment exports DATABASE_URL (e.g. a developer shell).
  delete process.env.DATABASE_URL;
  dir = mkdtempSync(join(tmpdir(), "atlas-store-"));
  process.env.ATLAS_LOCAL_STORE_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ATLAS_LOCAL_STORE_DIR;
});

// Import after env is set so the store picks up the temp dir.
const { storeMode } = await import("@/lib/server/store");
const { getStore } = await import("@/lib/server/store");

function garmentInput(id: string, name: string) {
  return {
    id,
    name,
    category: "top",
    colors: ["blue"],
    material: null,
    pattern: null,
    warmth: 1,
    formality: 1,
    seasons: ["spring"],
    occasions: ["casual"],
    price: 100,
    currency: "USD",
    wearCount: 0,
    status: "confirmed",
    analysisProvider: "user",
  };
}

describe("local file store", () => {
  it("selects local_file when DATABASE_URL is absent", () => {
    expect(storeMode()).toBe("local_file");
  });

  it("isolates principals completely", async () => {
    const { store } = getStore();
    await store.createGarment("alice", garmentInput("g1", "Alice Top"));
    await store.createGarment("bob", garmentInput("g2", "Bob Top"));

    const alice = await store.listGarments("alice");
    const bob = await store.listGarments("bob");
    expect(alice.map((g) => g.name)).toEqual(["Alice Top"]);
    expect(bob.map((g) => g.name)).toEqual(["Bob Top"]);

    // Alice cannot delete Bob's garment.
    expect(await store.deleteGarment("alice", "g2")).toBe(false);
    expect(await store.listGarments("bob")).toHaveLength(1);
    // Owner deletes fine.
    expect(await store.deleteGarment("bob", "g2")).toBe(true);
  });

  it("logs wears idempotently per key", async () => {
    const { store } = getStore();
    await store.createGarment("carol", garmentInput("g3", "Carol Knit"));
    const first = await store.logWear("carol", "g3", "wear-key-1");
    expect(first).toMatchObject({ ok: true, duplicate: false, wearCount: 1 });
    const replay = await store.logWear("carol", "g3", "wear-key-1");
    expect(replay).toMatchObject({ ok: true, duplicate: true, wearCount: 1 });
    const nextDay = await store.logWear("carol", "g3", "wear-key-2");
    expect(nextDay).toMatchObject({ ok: true, duplicate: false, wearCount: 2 });
    // Unknown garment rejected.
    expect(await store.logWear("carol", "missing", "k")).toMatchObject({ ok: false });
  });

  it("tracks signal state transitions per principal", async () => {
    const { store } = getStore();
    await store.upsertSignal("dana", {
      id: "s1",
      principalId: "dana",
      kind: "renewal",
      title: "t",
      implication: "i",
      noticed: "n",
      urgency: "review",
      domains: ["money"],
      evidence: [],
      uncertainty: 0.4,
      capability: "prepare",
      primaryAction: { label: "Review", kind: "review", href: "/money" },
      state: "active",
      stateUntil: null,
      createdAt: new Date().toISOString(),
      dedupKey: "d1",
    });
    expect(await store.setSignalState("mallory", "s1", "dismissed")).toBe(false);
    expect(await store.setSignalState("dana", "s1", "snoozed", "2026-12-01T00:00:00Z")).toBe(true);
    const signals = await store.listSignals("dana");
    expect(signals[0]?.state).toBe("snoozed");
  });

  it("wipes everything for one principal only", async () => {
    const { store } = getStore();
    await store.createGarment("erin", garmentInput("g4", "Erin Coat"));
    await store.createGarment("finn", garmentInput("g5", "Finn Coat"));
    await store.wipe("erin");
    expect(await store.listGarments("erin")).toHaveLength(0);
    expect(await store.listGarments("finn")).toHaveLength(1);
  });
});
