import { NextResponse } from "next/server";
import { devAuthEnabled, devJwks } from "@/lib/server/devAuth";

/** Public key set for the local-development token issuer. 404 outside local dev. */
export function GET() {
  if (!devAuthEnabled()) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(devJwks(), { headers: { "cache-control": "no-store" } });
}
