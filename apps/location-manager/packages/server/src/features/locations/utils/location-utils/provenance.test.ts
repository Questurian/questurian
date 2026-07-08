import { describe, expect, test } from "bun:test";
import { demoteProvenanceForOperatorEdit } from "./provenance";
import type { Location } from "../../models/location";

function locationWith(overrides: Partial<Location>): Location {
  return {
    name: "Nebula",
    address: "123 Main St, Lima",
    url: "https://www.google.com/maps",
    category: "dining",
    ...overrides,
  } as Location;
}

describe("demoteProvenanceForOperatorEdit", () => {
  test("demotes a tracked field when the operator changes its value", () => {
    const location = locationWith({
      type: "italian",
      provenanceJson: JSON.stringify({ type: "google", bookingUrl: "ai" }),
    });

    const result = demoteProvenanceForOperatorEdit(location, { type: "peruvian" });

    expect(result).toBe(JSON.stringify({ bookingUrl: "ai" }));
  });

  test("returns undefined when the submitted value matches the stored value", () => {
    const location = locationWith({
      type: "italian",
      provenanceJson: JSON.stringify({ type: "google" }),
    });

    expect(demoteProvenanceForOperatorEdit(location, { type: "italian" })).toBeUndefined();
  });

  test("returns undefined when the changed field carries no provenance", () => {
    const location = locationWith({
      type: "italian",
      provenanceJson: JSON.stringify({ bookingUrl: "ai" }),
    });

    expect(demoteProvenanceForOperatorEdit(location, { type: "peruvian" })).toBeUndefined();
  });

  test("returns undefined when the location has no provenance sidecar", () => {
    const location = locationWith({ type: "italian" });

    expect(demoteProvenanceForOperatorEdit(location, { type: "peruvian" })).toBeUndefined();
  });

  test("clearing a field demotes it", () => {
    const location = locationWith({
      bookingUrl: "https://resy.com/x",
      provenanceJson: JSON.stringify({ bookingUrl: "scraper" }),
    });

    const result = demoteProvenanceForOperatorEdit(location, { bookingUrl: null });

    expect(result).toBeNull();
  });

  test("returns null when the last entry is demoted so the column clears", () => {
    const location = locationWith({
      type: "italian",
      provenanceJson: JSON.stringify({ type: "ai" }),
    });

    expect(demoteProvenanceForOperatorEdit(location, { type: "peruvian" })).toBeNull();
  });

  test("idealFor tag changes demote, reordering does not", () => {
    const location = locationWith({
      idealForJson: JSON.stringify(["date_night", "groups"]),
      provenanceJson: JSON.stringify({ idealFor: "ai" }),
    });

    expect(
      demoteProvenanceForOperatorEdit(location, {
        idealForJson: JSON.stringify(["groups", "date_night"]),
      })
    ).toBeUndefined();

    expect(
      demoteProvenanceForOperatorEdit(location, {
        idealForJson: JSON.stringify(["groups", "solo"]),
      })
    ).toBeNull();
  });

  test("demotes several fields edited in one batch", () => {
    const location = locationWith({
      type: "italian",
      menuUrl: "https://old.example/menu",
      provenanceJson: JSON.stringify({ type: "google", menuUrl: "scraper", tripadvisorUrl: "tripadvisor" }),
    });

    const result = demoteProvenanceForOperatorEdit(location, {
      type: "peruvian",
      menuUrl: "https://new.example/menu",
    });

    expect(result).toBe(JSON.stringify({ tripadvisorUrl: "tripadvisor" }));
  });

  test("invalid provenance entries are dropped rather than round-tripped", () => {
    const location = locationWith({
      type: "italian",
      provenanceJson: JSON.stringify({ type: "google", title: "banana" }),
    });

    const result = demoteProvenanceForOperatorEdit(location, { type: "peruvian" });

    expect(result).toBeNull();
  });
});
