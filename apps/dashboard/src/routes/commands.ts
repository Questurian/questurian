import { Hono } from "hono";

const commands = new Hono();

commands.get("/", (c) => {
  // TODO: List available commands/actions for all projects
  return c.json({
    commands: [],
    message: "Placeholder: Will list all available commands across projects",
  });
});

commands.get("/:project", (c) => {
  const project = c.req.param("project");
  // TODO: List commands for a specific project
  return c.json({
    project,
    commands: [],
    message: `Placeholder: Will list commands for project '${project}'`,
  });
});

commands.post("/:project/:command", async (c) => {
  const project = c.req.param("project");
  const command = c.req.param("command");
  // TODO: Execute command for a project
  return c.json({
    project,
    command,
    status: "not_implemented",
    message: `Placeholder: Will execute '${command}' on project '${project}'`,
  });
});

export default commands;
