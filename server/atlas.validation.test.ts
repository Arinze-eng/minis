import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { ownerId } from "./atlas";

describe("Atlas procedures", () => {
  it("uses a stable preview owner when no authenticated user exists", () => {
    expect(ownerId(null)).toBe("preview-owner");
    expect(ownerId("user-123")).toBe("user-123");
  });

  it("rejects empty chat requests before calling the model", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.atlas.chat({ message: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid preference time windows at the procedure boundary", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.atlas.preferences({
      quietHoursEnabled: true,
      quietStart: "25:00",
      quietEnd: "07:30",
      webuiNotifications: true,
      telegramDelivery: false,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects non-image uploads before storage is called", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.atlas.uploadImage({ kind: "person", dataUrl: "data:text/plain;base64,SGVsbG8=" })).rejects.toThrow("Only JPEG");
  });

  it("requires a selected garment for virtual try-on", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.atlas.virtualTryOn({ wardrobeId: 999999, personImageRef: "missing-key" })).rejects.toThrow();
  });
});
