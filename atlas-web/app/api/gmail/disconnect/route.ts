import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { gmailConfigured, revokeToken } from "@/lib/server/gmail";
import { tokenEncryptionConfigured } from "@/lib/server/secretBox";

/**
 * Disconnect Gmail: revoke at Google (best-effort), delete all retained
 * Gmail-derived data (findings, scan jobs), mark the connection disconnected,
 * and audit. Local token material is destroyed regardless of revoke outcome.
 */
export async function POST() {
  if (!gmailConfigured()) {
    return NextResponse.json({ error: "gmail_not_configured" }, { status: 503 });
  }
  const principal = await requirePrincipal();
  const { store } = getStore();
  const connection = await store.getSourceConnection(principal.userId, "gmail");

  let revokedAtGoogle = false;
  const envelope = connection?.encryptedRefreshToken;
  if (envelope && tokenEncryptionConfigured()) {
    try {
      const { decryptRefreshToken } = await import("@/lib/server/secretBox");
      const refreshToken = decryptRefreshToken(envelope);
      if (refreshToken) revokedAtGoogle = await revokeToken(refreshToken);
    } catch {
      // decrypt failure must not block local cleanup
    }
  }

  await store.deleteSourceData(principal.userId, "gmail");
  await store.audit(principal.userId, "gmail_disconnected", null, {
    revokedAtGoogle,
    retainedDataDeleted: true,
  });

  return NextResponse.json({
    ok: true,
    revokedAtGoogle,
    note: revokedAtGoogle
      ? "Access revoked at Google and all retained Gmail data deleted."
      : "Revocation at Google was not confirmed (token may already be expired). Local data deleted and the stored token destroyed.",
  });
}
