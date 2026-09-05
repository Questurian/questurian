import type { ProjectConfig, ProjectStatus, ServiceConfig, ServiceStatus } from "../types";
import { checkHealth } from "./healthCheck";
import { isPortInUse } from "./portCheck";

/**
 * One definition of "is this service up", shared by the terminal UI and the
 * web UI.
 *
 * It used to live inside `useHealthCheck`, which meant the web tab would have
 * needed its own copy and the two would have drifted the first time a grace
 * period changed. React hooks stay in the hook; the rule lives here.
 */

/** When this process started, used as the boot grace period's origin. */
export const PROCESS_START_TIME = Date.now();

export const DEFAULT_GRACE_PERIOD_MS = 60000;

/**
 * Check one service.
 *
 * A failed health check plus a bound port means "starting", not "offline" --
 * during a dev-server boot the port is claimed well before it answers. Slow
 * services (python-alt-text loading BLIP) get the benefit of the doubt for
 * their grace period even before the port is bound.
 */
export async function checkServiceStatus(
  serviceConfig: ServiceConfig | undefined,
  startedAt: number = PROCESS_START_TIME,
): Promise<ServiceStatus> {
  if (!serviceConfig?.url || !serviceConfig?.port) {
    return "offline";
  }

  const { url, healthPath, port, slowStartup, startupGracePeriodMs } = serviceConfig;
  const healthStatus = await checkHealth(url, healthPath);

  if (healthStatus === "online") {
    return "online";
  }

  const portInUse = await isPortInUse(port);
  if (portInUse) {
    return "starting";
  }

  if (slowStartup) {
    const gracePeriod = startupGracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    if (Date.now() - startedAt < gracePeriod) {
      return "starting";
    }
  }

  return "offline";
}

export async function checkProjectStatus(
  project: ProjectConfig,
  startedAt: number = PROCESS_START_TIME,
): Promise<ProjectStatus> {
  const [client, server] = await Promise.all([
    checkServiceStatus(project.client, startedAt),
    checkServiceStatus(project.server, startedAt),
  ]);
  return { client, server };
}

export async function checkAllProjectStatuses(
  projects: readonly ProjectConfig[],
  startedAt: number = PROCESS_START_TIME,
): Promise<Map<string, ProjectStatus>> {
  const results = await Promise.all(
    projects.map(async (project) => [project.name, await checkProjectStatus(project, startedAt)] as const),
  );
  return new Map(results);
}
