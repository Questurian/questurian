import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createUsageRoutes } from "./usage";
import { SqliteUsageStore } from "../usage/store";

const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);

function app(): { app: Hono; store: SqliteUsageStore } {
  const store = new SqliteUsageStore(":memory:");
  const app = new Hono();
  app.route("/api/usage", createUsageRoutes({ store }));
  return { app, store };
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: T0,
    service: "abw-backend",
    provider: "google-vertex",
    feature: "prompt2blog",
    model: "gemini-3.1-pro-preview",
    durationMs: 500,
    status: "ok",
    tokens: { input: 10, output: 5, total: 15 },
    costUsd: 0.02,
    costBasis: "rate-table",
    ...overrides,
  };
}

function post(app: Hono, events: unknown[], headers: Record<string, string> = {}) {
  return app.request("/api/usage/v1/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ events }),
  });
}

afterEach(() => {
  delete process.env.DASHBOARD_INGEST_KEY;
});

describe("ingest route", () => {
  test("accepts a batch with 202 and reports what landed", async () => {
    const { app: server, store } = app();
    const response = await post(server, [event(), event({ eventId: "a" })]);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 2, duplicates: 0, rejected: 0 });
    store.close();
  });

  test("a replay of the same eventId accepts nothing", async () => {
    const { app: server, store } = app();
    await post(server, [event({ eventId: "same" })]);
    const response = await post(server, [event({ eventId: "same" })]);
    expect(await response.json()).toMatchObject({ accepted: 0, duplicates: 1 });
    store.close();
  });

  test("one bad event does not reject the batch", async () => {
    const { app: server, store } = app();
    const response = await post(server, [event(), { ts: T0, service: "x" }]);
    const body = (await response.json()) as { accepted: number; errors: unknown[] };
    expect(response.status).toBe(202);
    expect(body.accepted).toBe(1);
    expect(body.errors).toHaveLength(1);
    store.close();
  });

  test("rejects a body that is not JSON", async () => {
    const { app: server, store } = app();
    const response = await server.request("/api/usage/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
    store.close();
  });

  test("rejects an empty batch and one over the cap", async () => {
    const { app: server, store } = app();
    expect((await post(server, [])).status).toBe(400);
    expect((await post(server, Array.from({ length: 501 }, () => event()))).status).toBe(400);
    store.close();
  });

  test("with an ingest key set, a wrong key is refused", async () => {
    process.env.DASHBOARD_INGEST_KEY = "secret";
    const { app: server, store } = app();
    expect((await post(server, [event()], { "x-usage-key": "wrong" })).status).toBe(401);
    expect((await post(server, [event()])).status).toBe(401);
    expect((await post(server, [event()], { "x-usage-key": "secret" })).status).toBe(202);
    store.close();
  });
});

describe("read routes", () => {
  test("summary reflects the ingested events", async () => {
    const { app: server, store } = app();
    await post(server, [event(), event({ status: "error", costUsd: undefined })]);
    const response = await server.request("/api/usage/v1/summary");
    expect(await response.json()).toMatchObject({ calls: 2, errors: 1, errorRate: 0.5 });
    store.close();
  });

  test("series returns keys and rows the chart can stack", async () => {
    const { app: server, store } = app();
    await post(server, [event(), event({ provider: "anthropic" })]);
    const response = await server.request("/api/usage/v1/series?bucket=hour&groupBy=provider");
    const body = (await response.json()) as { keys: string[]; rows: unknown[] };
    expect(body.keys).toContain("anthropic");
    expect(body.rows).toHaveLength(1);
    store.close();
  });

  test("breakdown defaults to grouping by provider", async () => {
    const { app: server, store } = app();
    await post(server, [event()]);
    const body = (await (await server.request("/api/usage/v1/breakdown")).json()) as {
      groupBy: string;
    };
    expect(body.groupBy).toBe("provider");
    store.close();
  });

  test("facets list what the filter dropdowns should offer", async () => {
    const { app: server, store } = app();
    await post(server, [event(), event({ provider: "serpapi", service: "lm-server" })]);
    const body = await (await server.request("/api/usage/v1/facets")).json();
    expect(body).toMatchObject({
      providers: ["google-vertex", "serpapi"],
      services: ["abw-backend", "lm-server"],
    });
    store.close();
  });

  test("a misspelled dimension is a 400, not a silent unfiltered answer", async () => {
    const { app: server, store } = app();
    const response = await server.request("/api/usage/v1/breakdown?groupBy=provdier");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("groupBy") });
    store.close();
  });

  test("window and from together are a 400", async () => {
    const { app: server, store } = app();
    const response = await server.request(`/api/usage/v1/summary?window=24h&from=${T0}`);
    expect(response.status).toBe(400);
    store.close();
  });

  test("a window filters to recent events only", async () => {
    const { app: server, store } = app();
    const now = Date.now();
    await post(server, [
      event({ ts: now - 10 * 60_000 }),
      event({ ts: now - 10 * 86_400_000 }),
    ]);
    const body = (await (await server.request("/api/usage/v1/summary?window=1h")).json()) as {
      calls: number;
    };
    expect(body.calls).toBe(1);
    store.close();
  });

  test("events paginate with the returned cursor", async () => {
    const { app: server, store } = app();
    await post(server, [event({ eventId: "1" }), event({ eventId: "2" }), event({ eventId: "3" })]);
    const first = (await (await server.request("/api/usage/v1/events?limit=2")).json()) as {
      rows: unknown[];
      nextCursor: string;
    };
    expect(first.rows).toHaveLength(2);
    const second = (await (
      await server.request(`/api/usage/v1/events?limit=2&cursor=${first.nextCursor}`)
    ).json()) as { rows: unknown[]; nextCursor: string | null };
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    store.close();
  });
});
