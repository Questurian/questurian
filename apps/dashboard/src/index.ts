import { Hono } from "hono";
import { cors } from "hono/cors";
import { renderInkDashboard } from "./cli/dashboard";

import projects from "./routes/projects";
import health from "./routes/health";
import commands from "./routes/commands";
const app = new Hono();

// Note: logger disabled to avoid interfering with Ink CLI output
app.use("*", cors());

app.get("/", (c) => {
  return c.json({
    name: "Questurian Dashboard",
    version: "0.0.1",
    endpoints: {
      projects: "/projects",
      health: "/health",
      commands: "/commands",
    },
  });
});

app.route("/projects", projects);
app.route("/health", health);
app.route("/commands", commands);

const port = process.env.PORT || 4500;

// Render the Ink dashboard after a brief delay
setTimeout(() => {
  renderInkDashboard();
}, 1000);

export default {
  port,
  fetch: app.fetch,
};

