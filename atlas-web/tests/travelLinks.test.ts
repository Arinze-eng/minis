import { describe, expect, it } from "vitest";
import { googleFlightsUrl, googleHotelsUrl } from "@/lib/travelLinks";

describe("travel hand-off links", () => {
  it("prefills route and dates, and encodes user text", () => {
    const url = new URL(googleFlightsUrl({ origin: "London", destination: "Lisbon, Portugal", startDate: "2026-10-26", endDate: "2026-10-30" }));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("q")).toBe("Flights to Lisbon, Portugal from London on 2026-10-26 through 2026-10-30");
  });

  it("omits the origin when unknown and never lets input break out of the query", () => {
    const url = new URL(googleFlightsUrl({ destination: "Paris&x=<script>", startDate: "2026-01-01", endDate: "2026-01-02" }));
    expect(url.searchParams.get("q")).toBe("Flights to Paris&x=<script> on 2026-01-01 through 2026-01-02");
    expect(url.searchParams.has("x")).toBe(false);
    expect(new URL(googleHotelsUrl({ destination: "Rome", startDate: "a", endDate: "b" })).hostname).toBe("www.google.com");
  });
});
