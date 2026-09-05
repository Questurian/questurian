import { describe, expect, it } from "bun:test";
import { __internals, installUsageReporting } from "./reported-fetch";

const { providerFor, errorKindFor } = __internals;

describe("which provider a host belongs to", () => {
  it("names the services this server actually calls", () => {
    expect(providerFor("places.googleapis.com")).toBe("google-places");
    expect(providerFor("maps.googleapis.com")).toBe("google-maps");
    expect(providerFor("serpapi.com")).toBe("serpapi");
    expect(providerFor("api.foursquare.com")).toBe("foursquare");
    expect(providerFor("api.geoapify.com")).toBe("geoapify");
    expect(providerFor("api.bigdatacloud.net")).toBe("bigdatacloud");
    expect(providerFor("www.instagram.com")).toBe("instagram");
  });

  it("says nothing about our own processes", () => {
    // The Payload CMS, the alt-text service and this server's own callbacks
    // are not outside calls, and the alt-text service reports its own with
    // far more detail than a URL can carry.
    expect(providerFor("localhost")).toBeNull();
    expect(providerFor("127.0.0.1")).toBeNull();
  });

  it("leaves a host it has never been told about unnamed", () => {
    // Reported as a gap to be named rather than folded into a guess.
    expect(providerFor("some-new-api.example.com")).toBeNull();
  });
});

describe("what a failing response is called", () => {
  it("uses the vocabulary the collector already has", () => {
    expect(errorKindFor(429)).toBe("quota_exhausted");
    expect(errorKindFor(403)).toBe("not_connected");
    expect(errorKindFor(503)).toBe("provider_unavailable");
    expect(errorKindFor(404)).toBe("invalid_response");
    expect(errorKindFor(200)).toBeUndefined();
  });
});

describe("wrapping fetch", () => {
  it("is idempotent, so a reload cannot stack wrappers", () => {
    const before = globalThis.fetch;
    installUsageReporting();
    const once = globalThis.fetch;
    installUsageReporting();
    expect(globalThis.fetch).toBe(once);
    expect(once).not.toBe(before);
  });

  it("passes an un-mapped call straight through untouched", async () => {
    // A reporting bug must not become an outage.
    installUsageReporting();
    const response = await fetch("data:text/plain,hello");
    expect(await response.text()).toBe("hello");
  });
});
