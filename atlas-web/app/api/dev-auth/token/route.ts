import { NextResponse } from "next/server";
import { devAuthEnabled } from "@/lib/server/devAuth";
import { convexTokenForRequest } from "@/lib/server/convexToken";

/** The labelled local principal's Convex token. 404 outside local dev (Clerk issues tokens there). */
export async function GET() {
  if (!devAuthEnabled()) return new NextResponse("Not found", { status: 404 });
  const token = await convexTokenForRequest();
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 401 });
  return NextResponse.json({ token }, { headers: { "cache-control": "no-store" } });
}
