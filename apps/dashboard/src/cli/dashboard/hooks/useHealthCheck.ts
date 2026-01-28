import { useState, useEffect, useRef } from "react";
import { ProjectConfig, ProjectStatus, ServiceStatus, ServiceConfig } from "../types";
import { HEALTH_CHECK_INTERVAL } from "../config";
import { checkHealth, isPortInUse } from "../utils";

interface UseHealthCheckResult {
  statuses: Map<string, ProjectStatus>;
  lastChecked: Date;
  isChecking: boolean;
  onlineCount: number;
}

// Module-level flag to prevent double initialization across component remounts
let healthCheckStarted = false;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

// Track when the dashboard started for grace period calculations
const dashboardStartTime = Date.now();
const DEFAULT_GRACE_PERIOD_MS = 60000; // 60 seconds default grace period

// Helper to compare status maps
function statusesEqual(
  a: Map<string, ProjectStatus>,
  b: Map<string, ProjectStatus>
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    const other = b.get(key);
    if (!other || other.client !== val.client || other.server !== val.server) {
      return false;
    }
  }
  return true;
}

/**
 * Check service status with "starting" detection
 * If health check fails but port is in use, the service is starting up
 * For slow-startup services, show "starting" during grace period even if port isn't bound yet
 */
async function checkServiceStatus(
  serviceConfig: ServiceConfig | undefined
): Promise<ServiceStatus> {
  if (!serviceConfig?.url || !serviceConfig?.port) {
    return "offline";
  }

  const { url, healthPath, port, slowStartup, startupGracePeriodMs } = serviceConfig;
  const healthStatus = await checkHealth(url, healthPath);

  if (healthStatus === "online") {
    return "online";
  }

  // Health check failed - check if port is in use (service starting)
  const portInUse = await isPortInUse(port);
  if (portInUse) {
    return "starting";
  }

  // For slow-startup services, show "starting" during grace period
  // even if the port isn't bound yet (e.g., Python loading ML models)
  if (slowStartup) {
    const gracePeriod = startupGracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    const elapsed = Date.now() - dashboardStartTime;
    if (elapsed < gracePeriod) {
      return "starting";
    }
  }

  return "offline";
}

export function useHealthCheck(projects: ProjectConfig[]): UseHealthCheckResult {
  const [statuses, setStatuses] = useState<Map<string, ProjectStatus>>(() => {
    const initial = new Map<string, ProjectStatus>();
    projects.forEach((project) => {
      initial.set(project.name, { client: "checking", server: "checking" });
    });
    return initial;
  });
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [isChecking, setIsChecking] = useState(true);
  const projectsRef = useRef(projects);
  const statusesRef = useRef(statuses);

  // Keep ref in sync
  statusesRef.current = statuses;

  useEffect(() => {
    // Prevent double-execution even if component remounts
    if (healthCheckStarted) return;
    healthCheckStarted = true;

    const checkAllStatuses = async () => {
      const results = await Promise.all(
        projectsRef.current.map(async (project) => {
          const [clientStatus, serverStatus] = await Promise.all([
            checkServiceStatus(project.client),
            checkServiceStatus(project.server),
          ]);
          return {
            name: project.name,
            client: clientStatus,
            server: serverStatus,
          };
        })
      );

      const newStatuses = new Map<string, ProjectStatus>();
      results.forEach((result) => {
        newStatuses.set(result.name, {
          client: result.client,
          server: result.server,
        });
      });

      // Only update state if statuses actually changed
      const hasChanged = !statusesEqual(statusesRef.current, newStatuses);
      if (hasChanged) {
        setStatuses(newStatuses);
        setLastChecked(new Date());
      }
      setIsChecking(false);
    };

    checkAllStatuses();
    healthCheckInterval = setInterval(checkAllStatuses, HEALTH_CHECK_INTERVAL);

    return () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
    };
  }, []);

  const onlineCount = Array.from(statuses.values()).filter(
    (s) => s.client === "online" || s.server === "online"
  ).length;

  return { statuses, lastChecked, isChecking, onlineCount };
}
