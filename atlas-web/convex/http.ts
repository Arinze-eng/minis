import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Clerk → Convex: `user.deleted` purges every row the user owns. The svix signature is verified
 * against CLERK_WEBHOOK_SECRET before anything is read; unsigned or replayed requests get 400.
 */
http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET?.trim();
    if (!secret) return new Response("Webhook not configured", { status: 500 });

    const payload = await request.text();
    let event: { type?: string; data?: { id?: string } };
    try {
      // svix 2.x verify() throws on a bad or stale signature and returns nothing.
      new Webhook(secret).verify(payload, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
      event = JSON.parse(payload) as typeof event;
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    if (event.type === "user.deleted" && typeof event.data?.id === "string") {
      await ctx.runMutation(internal.privacy.purgeByClerkId, { clerkId: event.data.id });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
