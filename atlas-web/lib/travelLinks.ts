/**
 * Hand-off links for booking. Atlas prepares the search; the user books and pays on the provider's
 * own site, so no card details or bookings ever pass through Atlas.
 */
export type TripQuery = { origin?: string; destination: string; startDate: string; endDate: string };

export function googleFlightsUrl({ origin, destination, startDate, endDate }: TripQuery): string {
  const from = origin?.trim() ? ` from ${origin.trim()}` : "";
  const q = `Flights to ${destination.trim()}${from} on ${startDate} through ${endDate}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

export function googleHotelsUrl({ destination, startDate, endDate }: TripQuery): string {
  const q = `Hotels in ${destination.trim()} ${startDate} to ${endDate}`;
  return `https://www.google.com/travel/search?q=${encodeURIComponent(q)}`;
}

