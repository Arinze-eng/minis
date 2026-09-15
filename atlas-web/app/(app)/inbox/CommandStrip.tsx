import Link from "next/link";
import { demoMoney } from "@/lib/demo/audit";
import { costPerWear, type CommandStripData } from "@/lib/wardrobe";
import { demoWardrobe } from "@/lib/demo/wardrobe";
import { formatMoney } from "@/lib/format";

/**
 * Command strip: the two numbers that matter (annualized drain, average CPW)
 * plus the urgent ribbon. Deliberately restrained — every number carries its
 * assumption, and nothing here is a vanity metric.
 */
export function CommandStrip() {
  const money = demoMoney();
  const wardrobe = demoWardrobe();
  const withCPW = wardrobe.garments
    .map((g) => ({ g, cpw: costPerWear(g) }))
    .filter((x) => x.cpw.basis === "confirmed_wears");
  const firstCPW = withCPW[0]?.cpw;
  const avg: ReturnType<typeof costPerWear> | undefined =
    firstCPW !== undefined
      ? {
          ...firstCPW,
          value: withCPW.reduce((sum, x) => sum + x.cpw.value, 0) / withCPW.length,
        }
      : undefined;
  const ownedValue = wardrobe.garments.reduce((sum, g) => sum + (g.price ?? 0), 0);

  const urgent = [
    ...money.findings
      .filter((f) => f.trialEndDate || f.nextRenewalDate)
      .slice(0, 2)
      .map((f) => ({
        id: f.id,
        title: `${f.merchant.replace(" (demo merchant)", "")} ${
          f.trialEndDate ? "trial ends soon" : "renews soon"
        }`,
        detail: f.trialEndDate
          ? `Trial ends ${new Date(f.trialEndDate).toLocaleDateString()}`
          : `Renews ${new Date(f.nextRenewalDate ?? "").toLocaleDateString()} — annualized ${formatMoney(f.annualized ?? 0, f.currency)}`,
        href: "/money",
        urgency: "review" as const,
      })),
    ...(withCPW.some((x) => x.g.category === "outerwear" && x.cpw.value > 20)
      ? [
          {
            id: "outerwear-cpw",
            title: "Outerwear with high cost per wear",
            detail: "Low wear count against its price — a review opportunity.",
            href: "/wardrobe?category=outerwear",
            urgency: "normal" as const,
          },
        ]
      : []),
  ];

  const data: CommandStripData = {
    wardrobeValue: { value: ownedValue, currency: "USD", itemCount: wardrobe.garments.length },
    annualizedDrain: {
      totalAnnualized: money.annualizedTotal,
      currency: money.currency,
      cadenceAssumption: money.cadenceAssumption,
      subscriptionCount: money.findings.filter((f) => f.annualized !== undefined).length,
      refreshedAt: money.refreshedAt,
    },
    averageCPW: avg !== undefined
      ? { ...avg, garmentCount: withCPW.length }
      : undefined,
    urgent,
    sources: money.mode === "demo" ? [] : [],
  };

  return (
    <section className="command-strip" aria-label="Overview">
      <div className="strip-metrics">
        <div className="strip-metric">
          <span className="strip-label">Annualized subscription cost</span>
          <span className="strip-value">
            {formatMoney(data.annualizedDrain?.totalAnnualized ?? 0, data.annualizedDrain?.currency ?? "USD")}
          </span>
          <span className="strip-note">
            {data.annualizedDrain?.subscriptionCount} findings with known cadence · cadence assumption shown per finding
          </span>
        </div>
        <div className="strip-metric">
          <span className="strip-label">Average cost per wear</span>
          <span className="strip-value">
            {data.averageCPW
              ? `${formatMoney(data.averageCPW.value, data.averageCPW.currency)}`
              : "—"}
          </span>
          <span className="strip-note">
            across {data.averageCPW?.garmentCount ?? 0} priced garments with confirmed wears
          </span>
        </div>
        <div className="strip-metric">
          <span className="strip-label">Owned wardrobe value</span>
          <span className="strip-value">
            {formatMoney(data.wardrobeValue?.value ?? 0, data.wardrobeValue?.currency ?? "USD")}
          </span>
          <span className="strip-note">{data.wardrobeValue?.itemCount} garments · prices you entered</span>
        </div>
      </div>

      {urgent.length > 0 ? (
        <div className="urgent-ribbon" role="list" aria-label="Time-sensitive reviews">
          {urgent.map((u) => (
            <Link
              key={u.id}
              role="listitem"
              href={u.href}
              className={`urgent-item ${u.urgency === "review" ? "urgent-review" : ""}`}
            >
              <span className="urgent-title">{u.title}</span>
              <span className="urgent-detail">{u.detail}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
