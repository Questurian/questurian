import { Hono } from "hono";
import {
  ALL_PORTS,
  GLOBAL_COMMANDS,
  HEALTH_CHECK_INTERVAL,
  PROJECTS,
} from "../cli/dashboard/config";
import { checkAllProjectStatuses } from "../cli/dashboard/utils";

/**
 * The service inventory, over HTTP.
 *
 * This used to be a placeholder that returned an empty list. The web UI needs
 * the same rows the terminal view renders, so the real `PROJECTS` config is
 * served here and both faces read one source.
 */

const projects = new Hono();

projects.get("/", (c) =>
  c.json({
    projects: PROJECTS,
    ports: ALL_PORTS,
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL,
  }),
);

/**
 * Live status for every project.
 *
 * Kept as its own route rather than folded into `/projects` because it costs a
 * health request and an `lsof` per service: listing the inventory should not.
 */
projects.get("/health", async (c) => {
  const statuses = await checkAllProjectStatuses(PROJECTS);
  return c.json({
    checkedAt: Date.now(),
    statuses: Object.fromEntries(statuses),
  });
});

projects.get("/commands", (c) => c.json({ commands: GLOBAL_COMMANDS }));

projects.get("/:name", (c) => {
  const name = c.req.param("name");
  const project = PROJECTS.find((candidate) => candidate.name === name);
  if (!project) return c.json({ error: `no project named '${name}'` }, 404);
  return c.json({ project });
});

projects.get("/:name/status", async (c) => {
  const name = c.req.param("name");
  const project = PROJECTS.find((candidate) => candidate.name === name);
  if (!project) return c.json({ error: `no project named '${name}'` }, 404);
  const statuses = await checkAllProjectStatuses([project]);
  return c.json({ project: name, status: statuses.get(name), checkedAt: Date.now() });
});

export default projects;
