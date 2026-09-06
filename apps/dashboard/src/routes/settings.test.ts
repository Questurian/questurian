import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsRoutes } from "./settings";
import { allJobs } from "../settings/catalogue";
import { createSettingsStore } from "../settings/store";

function routes() {
  const directory = mkdtempSync(join(tmpdir(), "model-settings-"));
  const store = createSettingsStore(join(directory, "model-settings.json"));
  const app = createSettingsRoutes({ store });
  return async (path: string, init?: RequestInit) => {
    const response = await app.fetch(new Request(`http://dashboard.test${path}`, init));
    return { status: response.status, body: await response.json() };
  };
}

function put(model: string, note?: string): RequestInit {
  return {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, note }),
  };
}

describe("the table the gateway fetches", () => {
  it("names every job in the registry", async () => {
    const call = routes();
    const { body } = await call("/v1/models");
    expect(Object.keys(body.jobs).sort()).toEqual(allJobs().map((job) => job.id).sort());
  });

  it("serves the registry's default for a job nobody has touched", async () => {
    // The point of storing only changes: a default changed in code reaches
    // every untouched job immediately, with nothing to re-save.
    const call = routes();
    const { body } = await call("/v1/models");
    expect(body.jobs["lm.alt_text"].model).toBe("gemini-2.5-pro");
  });

  it("serves an override once one is set, and the default again once cleared", async () => {
    const call = routes();
    await call("/v1/models/lm.alt_text", put("gemini-2.5-flash"));
    expect((await call("/v1/models")).body.jobs["lm.alt_text"].model).toBe("gemini-2.5-flash");

    await call("/v1/models/lm.alt_text", { method: "DELETE" });
    expect((await call("/v1/models")).body.jobs["lm.alt_text"].model).toBe("gemini-2.5-pro");
  });

  it("carries no model for a job that reaches an API without one", async () => {
    const call = routes();
    const { body } = await call("/v1/models");
    expect(body.jobs["listicle.resolve_place"].model).toBeNull();
  });
});

describe("changing a job's model", () => {
  it("records when it was changed and why", async () => {
    const call = routes();
    const { body } = await call("/v1/models/lm.alt_text", put("gemini-2.5-flash", "too slow"));
    expect(body.model).toBe("gemini-2.5-flash");
    expect(body.note).toBe("too slow");
    expect(Date.parse(body.changedAt)).toBeGreaterThan(0);
  });

  it("refuses a job that has no model to change", async () => {
    // Offering a picker for a Places lookup would be offering a choice that
    // does nothing.
    const call = routes();
    const { status } = await call("/v1/models/listicle.resolve_place", put("gemini-2.5-flash"));
    expect(status).toBe(400);
  });

  it("refuses a job the registry has never heard of", async () => {
    const call = routes();
    const { status } = await call("/v1/models/p2b.invented", put("gemini-2.5-flash"));
    expect(status).toBe(404);
  });

  it("refuses a body without a model", async () => {
    const call = routes();
    const { status } = await call("/v1/models/lm.alt_text", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "no model here" }),
    });
    expect(status).toBe(400);
  });

  it("accepts a model the rate table has never heard of", async () => {
    // It runs and reports unpriced. Refusing to call a model because we cannot
    // price it would be the telemetry tail wagging the dog.
    const call = routes();
    const { status } = await call("/v1/models/lm.alt_text", put("gemini-4.0-unreleased"));
    expect(status).toBe(200);
  });

  it("says nothing was cleared when there was no override", async () => {
    const call = routes();
    const { body } = await call("/v1/models/lm.alt_text", { method: "DELETE" });
    expect(body.cleared).toBe(false);
    expect(body.model).toBe("gemini-2.5-pro");
  });
});

describe("what the settings screen is given", () => {
  it("explains each job, not just its model", async () => {
    const call = routes();
    const { body } = await call("/v1/jobs");
    const altText = body.jobs.find((job: { id: string }) => job.id === "lm.alt_text");
    expect(altText.app).toBe("location-manager");
    expect(altText.summary.length).toBeGreaterThan(0);
    expect(altText.site).toContain("generation.py");
    expect(altText.overridden).toBe(false);
    expect(altText.defaultModel).toBe("gemini-2.5-pro");
  });

  it("marks which jobs have been moved off their default", async () => {
    const call = routes();
    await call("/v1/models/lm.alt_text", put("gemini-2.5-flash"));
    const { body } = await call("/v1/jobs");
    const altText = body.jobs.find((job: { id: string }) => job.id === "lm.alt_text");
    expect(altText.overridden).toBe(true);
    expect(altText.model).toBe("gemini-2.5-flash");
    expect(altText.defaultModel).toBe("gemini-2.5-pro");
  });

  it("offers the models that are actually in use", async () => {
    const call = routes();
    const { body } = await call("/v1/jobs");
    expect(body.offeredModels).toContain("gemini-2.5-flash");
    expect(body.offeredModels).not.toContain("gemini-3.1-pro-preview");
  });

  it("marks the two jobs that cannot be configured", async () => {
    const call = routes();
    const { body } = await call("/v1/configurable");
    expect(body.jobs).not.toContain("listicle.resolve_place");
    expect(body.jobs).not.toContain("listicle.place_details");
    expect(body.jobs).toContain("lm.alt_text");
  });
});

describe("the settings file", () => {
  it("survives a reader that starts fresh", async () => {
    // Two processes read this: the route handler and, after a restart, itself.
    const directory = mkdtempSync(join(tmpdir(), "model-settings-"));
    const path = join(directory, "model-settings.json");

    const first = createSettingsRoutes({ store: createSettingsStore(path) });
    await first.fetch(
      new Request("http://dashboard.test/v1/models/lm.alt_text", put("gemini-2.5-flash")),
    );

    const second = createSettingsRoutes({ store: createSettingsStore(path) });
    const response = await second.fetch(new Request("http://dashboard.test/v1/models"));
    const body = await response.json();
    expect(body.jobs["lm.alt_text"].model).toBe("gemini-2.5-flash");
  });

  it("treats a missing file as every job being on its default", async () => {
    const directory = mkdtempSync(join(tmpdir(), "model-settings-"));
    const store = createSettingsStore(join(directory, "never-written.json"));
    expect(store.overrides()).toEqual({});
  });
});

describe("the Claude substitution", () => {
  it("says what really serves a job that asks for a model nothing can reach", async () => {
    // Three Prompt2Blog stages ask for Claude and run on Gemini. A settings
    // screen that showed only the name they ask for would rebuild, in a new
    // place, exactly the invisibility this work exists to end.
    const call = routes();
    const { body } = await call("/v1/jobs");
    const outline = body.jobs.find((job: { id: string }) => job.id === "p2b.outline");
    expect(outline.model).toMatch(/^claude-/);
    expect(outline.servedBy).toBe("gemini-2.5-flash");
  });

  it("says nothing for a job that gets the model it asks for", async () => {
    // A Gemini job, deliberately. This used to read p2b.compose, which stopped
    // being an example of "asks for what it gets" the day compose moved back
    // onto Opus.
    const call = routes();
    const { body } = await call("/v1/jobs");
    const audit = body.jobs.find((job: { id: string }) => job.id === "p2b.audit");
    expect(audit.model).toBe("gemini-2.5-flash");
    expect(audit.servedBy).toBeNull();
  });
});

describe("whether the apps are actually reading this table", () => {
  it("says so plainly when an app is not running", async () => {
    // Pointed at a port nothing can be on, rather than assuming the developer
    // does not happen to have the app running. A test whose result depends on
    // what is up on this machine tells you about the machine, not the code.
    const previous = process.env.ABW_BASE_URL;
    process.env.ABW_BASE_URL = "http://127.0.0.1:9";
    try {
      const call = routes();
      const { body } = await call("/v1/listeners");
      const abw = body.apps.find(
        (entry: { app: string }) => entry.app === "ai-blog-writer",
      );
      expect(abw.reachable).toBe(false);
      expect(abw.url).toContain("/model-gateway/status");
    } finally {
      if (previous === undefined) delete process.env.ABW_BASE_URL;
      else process.env.ABW_BASE_URL = previous;
    }
  });

  it("asks both apps, not just the one that was wired first", async () => {
    // The bug this endpoint exists for: Location Manager was wired to this
    // dashboard and ai-blog-writer was not, so the Models tab appeared to
    // change 39 jobs and changed none of them.
    const call = routes();
    const { body } = await call("/v1/listeners");
    expect(body.apps.map((entry: { app: string }) => entry.app).sort()).toEqual([
      "ai-blog-writer",
      "location-manager",
    ]);
  });
});
