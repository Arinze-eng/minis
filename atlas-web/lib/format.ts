import type { CostPerWear } from "@/lib/wardrobe";

/** Intl-based currency formatting (product contract §8: Intl everywhere). */
export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatCPW(cpw: CostPerWear): string {
  switch (cpw.basis) {
    case "confirmed_wears":
      return `${formatMoney(cpw.value, cpw.currency)} / wear`;
    case "no_wears_yet":
      return "no wears yet";
    case "price_unknown":
      return "CPW needs a price";
  }
}
