import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { completeTask, createVirtualTryOn, getChatHistory, getDashboard, ownerId, savePreferences, searchResearch, sendChat, updateSignal, uploadAtlasImage } from "./atlas";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  atlas: router({
    dashboard: publicProcedure.query(({ ctx }) => getDashboard(ownerId(ctx.user?.openId))),
    chatHistory: publicProcedure.query(({ ctx }) => getChatHistory(ownerId(ctx.user?.openId))),
    chat: publicProcedure
      .input(z.object({ message: z.string().trim().min(1).max(4000) }))
      .mutation(({ ctx, input }) => sendChat(ownerId(ctx.user?.openId), input.message)),
    research: publicProcedure
      .input(z.object({ query: z.string().trim().min(2).max(240) }))
      .query(({ input }) => searchResearch(input.query)),
    taskStatus: publicProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["open", "completed", "snoozed"]) }))
      .mutation(({ ctx, input }) => completeTask(ownerId(ctx.user?.openId), input.id, input.status)),
    signalStatus: publicProcedure
      .input(z.object({ id: z.number().int().positive(), state: z.enum(["active", "dismissed", "completed"]) }))
      .mutation(({ ctx, input }) => updateSignal(ownerId(ctx.user?.openId), input.id, input.state)),
    preferences: publicProcedure
      .input(z.object({
        quietHoursEnabled: z.boolean(),
        quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        webuiNotifications: z.boolean(),
        telegramDelivery: z.boolean(),
      }))
      .mutation(({ ctx, input }) => savePreferences(ownerId(ctx.user?.openId), input)),
    uploadImage: publicProcedure
      .input(z.object({ dataUrl: z.string().max(15_000_000), kind: z.enum(["wardrobe", "person"]), wardrobeId: z.number().int().positive().optional(), fileName: z.string().max(180).optional() }))
      .mutation(({ ctx, input }) => uploadAtlasImage(ownerId(ctx.user?.openId), input)),
    virtualTryOn: publicProcedure
      .input(z.object({ wardrobeId: z.number().int().positive(), personImageRef: z.string().min(1).max(600) }))
      .mutation(({ ctx, input }) => createVirtualTryOn(ownerId(ctx.user?.openId), input)),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
