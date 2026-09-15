import { trpc } from "@/lib/trpc";

export function useAtlasDashboard() {
  return trpc.atlas.dashboard.useQuery(undefined, { staleTime: 15_000, retry: 1 });
}
