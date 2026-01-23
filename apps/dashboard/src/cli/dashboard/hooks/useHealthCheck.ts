import { useState, useEffect, useRef } from "react";
import { ProjectConfig, ProjectStatus } from "../types";
import { HEALTH_CHECK_INTERVAL } from "../config";
import { checkHealth } from "../utils";

interface UseHealthCheckResult {
  statuses: Map<string, ProjectStatus>;
  lastChecked: Date;
  isChecking: boolean;
  onlineCount: number;
}

// Module-level flag to prevent double initialization across component remounts
let healthCheckStarted = false;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

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
            project.client
              ? checkHealth(project.client.url, project.client.healthPath)
              : ("offline" as const),
            project.server
              ? checkHealth(project.server.url, project.server.healthPath)
              : ("offline" as const),
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
        // Clear screen before updating to prevent stacking
        process.stdout.write("\x1b[2J\x1b[H");
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
