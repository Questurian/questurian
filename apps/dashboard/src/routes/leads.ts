import { Hono } from "hono";

const leads = new Hono();

const LEADS_API_URL = process.env.LEADS_API_URL || "http://localhost:4004";

leads.get("/", (c) => {
  return c.json({
    name: "Questurian Leads",
    api_url: LEADS_API_URL,
    endpoints: {
      health: "/leads/health",
      status: "/leads/status",
    },
  });
});

leads.get("/health", async (c) => {
  try {
    const response = await fetch(`${LEADS_API_URL}/health`);
    const data = await response.json();
    return c.json({
      service: "questurian-leads",
      api_url: LEADS_API_URL,
      status: response.ok ? "healthy" : "unhealthy",
      response: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      service: "questurian-leads",
      api_url: LEADS_API_URL,
      status: "unreachable",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

leads.get("/status", async (c) => {
  try {
    const [healthRes, feedsRes, categoriesRes] = await Promise.allSettled([
      fetch(`${LEADS_API_URL}/health`),
      fetch(`${LEADS_API_URL}/feeds`),
      fetch(`${LEADS_API_URL}/categories`),
    ]);

    const health = healthRes.status === "fulfilled" && healthRes.value.ok;
    const feedsCount = feedsRes.status === "fulfilled" && feedsRes.value.ok
      ? (await feedsRes.value.json()).length
      : null;
    const categoriesCount = categoriesRes.status === "fulfilled" && categoriesRes.value.ok
      ? (await categoriesRes.value.json()).length
      : null;

    return c.json({
      service: "questurian-leads",
      api_url: LEADS_API_URL,
      status: health ? "online" : "offline",
      stats: {
        feeds: feedsCount,
        categories: categoriesCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({
      service: "questurian-leads",
      api_url: LEADS_API_URL,
      status: "unreachable",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

export default leads;
