import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

function configured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && ["1", "true", "yes", "on"].includes((process.env.ATLAS_ENABLE_TELEGRAM_DELIVERY ?? "").toLowerCase()));
}

export async function GET() {
  const principal = await requirePrincipal();
  const { store } = getStore();
  const preferences = await store.getPreferences(principal.userId);
  if (!configured()) return NextResponse.json({ configured: false, healthy: false, enabled: preferences.telegramDelivery === true });
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
    return NextResponse.json({ configured: true, healthy: response.ok && body.ok === true, enabled: preferences.telegramDelivery === true, username: body.result?.username ?? null });
  } catch {
    return NextResponse.json({ configured: true, healthy: false, enabled: preferences.telegramDelivery === true });
  }
}
