import { describe, expect, it } from "vitest";
import { extractFinding } from "@/convex/model/email";

const find = (subject: string, from = "Netflix <info@netflix.com>") => extractFinding({ messageId: "m", headers: { subject, from } });

describe("email extraction", () => {
  it("reads thousands separators and decimals", () => {
    expect(find("Your receipt: ₦3,000")?.amount).toBe(3000);
    expect(find("Your receipt: $1,234.56")?.amount).toBe(1234.56);
    expect(find("Ihre Rechnung: €1.234,56")?.amount).toBe(1234.56);
    expect(find("Payment of £9.99 / month")?.amount).toBe(9.99);
    expect(find("Payment of $15")?.amount).toBe(15);
  });

  it("keeps the Message-ID header without brackets for opening the exact email", () => {
    const f = extractFinding({ messageId: "m", headers: { subject: "Your receipt", from: "Netflix <a@netflix.com>", "message-id": " <abc.123@mail.netflix.com> " } });
    expect(f?.rfc822Id).toBe("abc.123@mail.netflix.com");
  });

  it("skips marketing that mentions an order", () => {
    expect(find("Chinaza, Get ₦3,000 OFF your order!", "Jumia Nigeria <x@jumia.com.ng>")).toBeNull();
    expect(find("20% off your next order")).toBeNull();
    expect(find("Your order is in progress")?.kind).toBe("receipt");
  });
});
