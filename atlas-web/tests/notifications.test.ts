import { describe, expect, it } from "vitest";
import {
  filterNotifications,
  unreadCount,
  relativeTime,
  NOTIFICATION_TABS,
  type AgentNotification,
} from "@/lib/notifications";
import { demoNotifications, withWearLogged } from "@/lib/demo/agent";
import { costPerWear } from "@/lib/wardrobe";
import { demoWardrobe } from "@/lib/demo/wardrobe";

function notif(overrides: Partial<AgentNotification>): AgentNotification {
  return {
    id: "n",
    category: "system",
    title: "t",
    detail: "d",
    action: { kind: "link", label: "go", href: "/inbox" },
    createdAt: new Date().toISOString(),
    read: false,
    urgency: "normal",
    ...overrides,
  };
}

describe("notification tabs", () => {
  const items = demoNotifications();

  it("exposes the four contract tabs", () => {
    expect(NOTIFICATION_TABS.map((t) => t.id)).toEqual([
      "all",
      "renewals",
      "closet",
      "system",
    ]);
  });

  it("keeps everything on the All tab", () => {
    expect(filterNotifications(items, "all")).toHaveLength(items.length);
  });

  it("filters by category on dedicated tabs", () => {
    const renewals = filterNotifications(items, "renewals");
    expect(renewals.length).toBeGreaterThan(0);
    expect(renewals.every((n) => n.category === "renewals")).toBe(true);
    const closet = filterNotifications(items, "closet");
    expect(closet.every((n) => n.category === "closet")).toBe(true);
  });

  it("sorts newest first regardless of input order", () => {
    const shuffled = [...items].reverse();
    const sorted = filterNotifications(shuffled, "all");
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev || !curr) continue;
      expect(Date.parse(prev.createdAt)).toBeGreaterThanOrEqual(
        Date.parse(curr.createdAt),
      );
    }
  });

  it("counts unread only", () => {
    const unread = unreadCount(items);
    const afterRead = unreadCount(items.map((n) => ({ ...n, read: true })));
    expect(unread).toBeGreaterThan(0);
    expect(afterRead).toBe(0);
  });
});

describe("relative time", () => {
  it("formats past and future offsets readably", () => {
    const now = Date.parse("2026-09-13T12:00:00Z");
    expect(relativeTime("2026-09-13T11:00:00Z", now)).toMatch(/hour|ago/);
    expect(relativeTime("2026-09-16T12:00:00Z", now)).toMatch(/day/);
  });
});

describe("wear logging", () => {
  it("increments wear count without mutating the original", () => {
    const original = demoWardrobe().garments.find(
      (g) => g.id === "demo-merino-knit",
    );
    if (!original) throw new Error("fixture missing");
    const before = original.wearCount;
    const updated = withWearLogged(original);
    expect(original.wearCount).toBe(before); // no mutation
    expect(updated.wearCount).toBe(before + 1);
    expect(updated.correctionHistory.at(-1)?.by).toBe("user_confirmed");
  });

  it("improves CPW after logging a wear", () => {
    const g = demoWardrobe().garments.find((x) => x.id === "demo-merino-knit");
    if (!g) throw new Error("fixture missing");
    const updated = withWearLogged(g);
    const before = costPerWear(g);
    const after = costPerWear(updated);
    if (before.basis === "confirmed_wears" && after.basis === "confirmed_wears") {
      expect(after.value).toBeLessThan(before.value);
    }
    expect(after.wears).toBe(before.wears + 1);
  });
});
