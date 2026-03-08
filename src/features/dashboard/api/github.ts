import { fetchDashboardGraphqlData } from "@/features/dashboard/api/github-query";
import {
  DashboardResult,
  mapDashboardData,
} from "@/features/dashboard/api/map-dashboard-data";

export async function fetchDashboard(
  token: string,
  first: number = 30,
): Promise<DashboardResult> {
  const data = await fetchDashboardGraphqlData(token, first);
  return mapDashboardData(data);
}
