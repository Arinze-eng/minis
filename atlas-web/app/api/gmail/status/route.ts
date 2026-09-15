import { NextResponse } from "next/server";
import { requirePrincipal, principalSummary } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { clerkConfigured } from "@/lib/server/clerkIdentity";
import {
  gmailConfigured,
  GMAIL_SCOPE,
} from "@/lib/server/gmail";
import { tokenEncryptionConfigured } from "@/lib/server/secretBox";

/**
 * Connection status for the /sources surface. Never returns token material.
 * States are honest: clerkConfigured (auth layer), gmailConfigured (Google
 * OAuth client), encryptionConfigured (token storage), connection row.
 */
export async function GET() {
  const { store } = getStore();
  const principal = await requirePrincipal();
  const connection = await store.getSourceConnection(principal.userId, "gmail");
  const latestScan = await store.latestScanJob(principal.userId, "gmail");

  return NextResponse.json({
    identity: principalSummary(principal),
    clerkConfigured: clerkConfigured(),
    gmailConfigured: gmailConfigured(),
    encryptionConfigured: tokenEncryptionConfigured(),
    scope: GMAIL_SCOPE,
    connection: connection
      ? {
          status: connection.status,
          scopes: connection.scopes,
          accountEmail: connection.accountEmail,
          connectedAt: connection.connectedAt,
          disconnectedAt: connection.disconnectedAt,
          lastError: connection.lastError,
        }
      : null,
    latestScan,
  });
}
