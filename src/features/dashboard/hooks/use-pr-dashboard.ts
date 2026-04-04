import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "@/features/dashboard/api/github";

export function usePrDashboard(token: string, limit: number, refetchInterval: number) {
  return useQuery({
    queryKey: ["pr-dashboard", limit, token],
    queryFn: () => fetchDashboard(token, limit),
    enabled: token.length > 0,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
  });
}
