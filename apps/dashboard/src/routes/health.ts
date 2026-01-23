import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "questurian-dashboard",
  });
});

health.get("/ready", (c) => {
  // TODO: Add actual readiness checks (db connections, external services, etc.)
  return c.json({
    ready: true,
    checks: {
      monorepo: "ok",
    },
  });
});

health.get("/live", (c) => {
  return c.json({
    alive: true,
  });
});

export default health;
