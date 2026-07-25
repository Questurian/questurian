import { mock } from "bun:test";

/**
 * Bun's `mock.module` registry is process-global and has no per-file teardown, so a
 * partial factory registered by one test file replaces the module namespace for every
 * file that runs afterwards — any export the factory omitted simply disappears. Several
 * suites mock a handful of functions off the shared repository barrels, which used to
 * strip the rest and break unrelated files downstream.
 *
 * This module is loaded via `bunfig.toml` preload, before any test file runs, so it
 * captures the genuine barrels while they are still untouched. Test files then override
 * through the helpers below, which re-spread the real namespace every time.
 */
import * as realCoreRepository from "../features/locations/repositories/core";
import * as realContentRepository from "../features/locations/repositories/content";

type CoreRepository = typeof realCoreRepository;
type ContentRepository = typeof realContentRepository;

/** Mock selected `repositories/core` exports, leaving the rest intact for other suites. */
export function mockCoreRepository(overrides: Partial<CoreRepository>): void {
  mock.module("../features/locations/repositories/core", () => ({
    ...realCoreRepository,
    ...overrides,
  }));
}

/** Mock selected `repositories/content` exports, leaving the rest intact for other suites. */
export function mockContentRepository(overrides: Partial<ContentRepository>): void {
  mock.module("../features/locations/repositories/content", () => ({
    ...realContentRepository,
    ...overrides,
  }));
}
