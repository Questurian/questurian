import type {
  GroupableDimension,
  SeriesBucket,
  SeriesMetric,
  UsageBreakdownRow,
  UsageEventPage,
  UsageFacets,
  UsageSeries,
  UsageSummary,
} from "../../usage/types";
import type { ProjectConfig, ProjectStatus } from "../../cli/dashboard/types";
import type { ratesPayload } from "../../usage/rates";

/**
 * Typed fetchers for the collector's own routes.
 *
 * The response types are imported from the server's own modules rather than
 * restated here, so a change to a query's shape is a type error in this file
 * instead of a blank column in the UI.
 */

export class ApiError extends Error {}

async function getJson<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    throw new ApiError(detail ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** The filter every usage read shares, as query-string values. */
export interface UsageQuery {
  window: string;
  service?: string;
  provider?: string;
  feature?: string;
  model?: string;
  status?: string;
  correlationId?: string;
}

export const fetchSummary = (query: UsageQuery) =>
  getJson<UsageSummary>("/api/usage/v1/summary", { ...query });

export const fetchSeries = (
  query: UsageQuery,
  options: { bucket: SeriesBucket; metric: SeriesMetric; groupBy?: GroupableDimension },
) =>
  getJson<UsageSeries>("/api/usage/v1/series", {
    ...query,
    bucket: options.bucket,
    metric: options.metric,
    groupBy: options.groupBy,
  });

export const fetchBreakdown = (query: UsageQuery, groupBy: GroupableDimension) =>
  getJson<{ groupBy: GroupableDimension; rows: UsageBreakdownRow[] }>(
    "/api/usage/v1/breakdown",
    { ...query, groupBy },
  );

export const fetchEvents = (query: UsageQuery, options: { limit?: number; cursor?: string | null }) =>
  getJson<UsageEventPage>("/api/usage/v1/events", {
    ...query,
    limit: options.limit === undefined ? undefined : String(options.limit),
    cursor: options.cursor ?? undefined,
  });

export const fetchFacets = (query: Pick<UsageQuery, "window">) =>
  getJson<UsageFacets>("/api/usage/v1/facets", { ...query });

export interface ProjectsResponse {
  projects: ProjectConfig[];
  ports: { name: string; port: number; type: string }[];
  healthCheckIntervalMs: number;
}

export interface ProjectHealthResponse {
  checkedAt: number;
  statuses: Record<string, ProjectStatus>;
}

export const fetchProjects = () => getJson<ProjectsResponse>("/projects");
export const fetchProjectHealth = () => getJson<ProjectHealthResponse>("/projects/health");
export const fetchGlobalCommands = () =>
  getJson<{ commands: { cmd: string; description: string; category: string }[] }>(
    "/projects/commands",
  );

/** The published rate card: what each model costs, checked and dated. */
export function fetchRates(): Promise<ReturnType<typeof ratesPayload>> {
  return getJson("/api/usage/v1/rates");
}
