import { Hono } from "hono";

const projects = new Hono();

projects.get("/", (c) => {
  // TODO: Implement actual project listing from Nx workspace
  return c.json({
    projects: [],
    message: "Placeholder: Will list all projects in the monorepo",
  });
});

projects.get("/:name", (c) => {
  const name = c.req.param("name");
  // TODO: Implement project details retrieval
  return c.json({
    project: null,
    name,
    message: `Placeholder: Will return details for project '${name}'`,
  });
});

projects.get("/:name/status", (c) => {
  const name = c.req.param("name");
  // TODO: Implement project status check
  return c.json({
    project: name,
    status: "unknown",
    message: `Placeholder: Will return status for project '${name}'`,
  });
});

export default projects;
