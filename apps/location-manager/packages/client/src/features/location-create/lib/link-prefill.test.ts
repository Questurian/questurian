import { describe, expect, test } from "bun:test";
import { readLinkPrefill } from "./link-prefill";

describe("readLinkPrefill", () => {
  test("reads the step-one fields and trims them", () => {
    const params = new URLSearchParams({
      name: " Juno Wings ",
      address: "Av. Grau 123, Barranco",
      tripadvisorUrl: "https://www.tripadvisor.com/Restaurant_Review-g294316-d1-Reviews-Juno.html",
    });
    expect(readLinkPrefill(params)).toEqual({
      name: "Juno Wings",
      address: "Av. Grau 123, Barranco",
      tripadvisorUrl: "https://www.tripadvisor.com/Restaurant_Review-g294316-d1-Reviews-Juno.html",
    });
  });

  test("an address with no place in it prefills nothing", () => {
    expect(readLinkPrefill(new URLSearchParams())).toBeNull();
    expect(readLinkPrefill(new URLSearchParams({ tripadvisorUrl: "https://x.test" }))).toBeNull();
  });
});
