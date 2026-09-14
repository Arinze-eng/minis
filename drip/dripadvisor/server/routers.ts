import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { generateImage } from "./_core/imageGeneration";
import { publicProcedure, router } from "./_core/trpc";
import { addFeedback, createGarment, deleteGarment, listGarments, listOutfits, saveOutfit } from "./dripadvisor.store";
import { analyzeGarment, providerStatus, recommendOutfits } from "./muse";
import { assetProvider } from "./assets";
import { neonConfigured } from "./neon";
import { generateTryOn } from "./museImage";
import { getCurrentWeather } from "./weather";

const demoAnalysis = {
  name: "New wardrobe piece",
  category: "top" as const,
  colors: ["needs confirmation"],
  pattern: "unknown",
  material: "unknown",
  warmth: 1,
  formality: 1,
  confidence: 0.25,
  explanation: "No image was supplied, so please confirm the details manually.",
};

function actorId(ctx: { user?: { id: number } | null }) {
  return ctx.user?.id ?? 0;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  integrations: router({
    status: publicProcedure.query(() => ({ ...providerStatus(), assetProvider: assetProvider(), neonConfigured: neonConfigured() })),
  }),
  weather: router({
    current: publicProcedure.input(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })).query(({ input }) => getCurrentWeather(input.latitude, input.longitude)),
  }),
  wardrobe: router({
    list: publicProcedure.query(({ ctx }) => listGarments(actorId(ctx))),
    analyzeAndCreate: publicProcedure.input(z.object({ imageDataUrl: z.string().max(12_000_000).optional() })).mutation(async ({ input, ctx }) => {
      const analyzed = input.imageDataUrl ? await analyzeGarment(input.imageDataUrl) : { analysis: demoAnalysis, provider: "manus" as const };
      const item = await createGarment({ ...analyzed.analysis, analysisProvider: analyzed.provider, imageDataUrl: input.imageDataUrl, status: analyzed.provider === "muse" ? "needs_confirmation" : "needs_confirmation" }, actorId(ctx));
      return { item, provider: analyzed.provider, requiresConfirmation: true };
    }),
    delete: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => deleteGarment(input.id, actorId(ctx))),
  }),
  outfits: router({
    list: publicProcedure.query(({ ctx }) => listOutfits(actorId(ctx))),
    recommend: publicProcedure.input(z.object({ requestText: z.string().trim().min(1).max(4000), preferences: z.string().trim().max(2000).optional(), weather: z.object({ temperatureC: z.number(), precipitationProbability: z.number(), condition: z.string() }).optional() })).mutation(async ({ input, ctx }) => {
      const wardrobe = await listGarments(actorId(ctx));
      const weatherText = input.weather ? `Current weather: ${input.weather.temperatureC}°C, ${input.weather.condition}, ${input.weather.precipitationProbability}% precipitation probability.` : undefined;
      const result = await recommendOutfits(input.requestText, wardrobe, [input.preferences, weatherText].filter(Boolean).join(" "));
      const saved = await Promise.all(result.suggestions.map((suggestion) => saveOutfit({ requestText: input.requestText, title: suggestion.title, note: suggestion.note, itemIds: suggestion.itemIndexes.map((index) => wardrobe[index]?.id).filter((id): id is number => typeof id === "number"), score: Math.round(suggestion.score * 100), provider: result.provider }, actorId(ctx))));
      return { outfits: saved, provider: result.provider };
    }),
    feedback: publicProcedure.input(z.object({ outfitId: z.number().int().positive(), decision: z.enum(["saved", "rejected", "tried_again", "reported"]), reason: z.string().max(2000).optional() })).mutation(({ input, ctx }) => addFeedback(input, actorId(ctx)).then(() => ({ success: true }))),
    generatePreview: publicProcedure.input(z.object({ outfitId: z.number().int().positive(), title: z.string().max(240), itemNames: z.array(z.string().max(120)).max(12), noticeAccepted: z.literal(true) })).mutation(async ({ input }) => {
      const prompt = `Editorial fashion flat-lay preview for an outfit named “${input.title}”. Use these wardrobe pieces: ${input.itemNames.join(", ")}. Create a clean, realistic arrangement on warm paper, no person, no text, no logos. AI-generated visual approximation; garment details may not be exact.`;
      const result = await generateImage({ prompt });
      return { outfitId: input.outfitId, url: result.url, provider: "manus-image" as const, notice: "AI-generated visual approximation; garment details and fit may not be exact." };
    }),
    tryOn: publicProcedure.input(z.object({ personImageDataUrl: z.string().startsWith("data:image/").max(12_000_000), clothingImageDataUrls: z.array(z.string().startsWith("data:image/").max(12_000_000)).min(1).max(5), request: z.string().max(1000).optional(), noticeAccepted: z.literal(true) })).mutation(async ({ input }) => generateTryOn(input)),
  }),
});

export type AppRouter = typeof appRouter;
