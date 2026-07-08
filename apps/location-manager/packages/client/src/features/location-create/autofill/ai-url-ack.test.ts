import { describe, expect, test } from "bun:test";
import {
  allAiUrlsAcknowledged,
  initAiUrlAck,
  liftAiUrlAckOnUserEdit,
  markAiUrlSuggested,
  setAiUrlAcknowledged,
} from "./ai-url-ack";

const FIELDS = ["menuUrl", "bookingUrl"] as const;

describe("ai-url-ack", () => {
  test("starts fully acknowledged so Create is not blocked before any AI suggestion", () => {
    const state = initAiUrlAck(FIELDS);
    expect(state).toEqual({ menuUrl: true, bookingUrl: true });
    expect(allAiUrlsAcknowledged(state)).toBe(true);
  });

  test("an AI suggestion requires acknowledgment and blocks the gate", () => {
    const state = markAiUrlSuggested(initAiUrlAck(FIELDS), "bookingUrl");
    expect(state.bookingUrl).toBe(false);
    expect(state.menuUrl).toBe(true);
    expect(allAiUrlsAcknowledged(state)).toBe(false);
  });

  test("operator acknowledgment reopens the gate and can be withdrawn", () => {
    let state = markAiUrlSuggested(initAiUrlAck(FIELDS), "menuUrl");
    state = setAiUrlAcknowledged(state, "menuUrl", true);
    expect(allAiUrlsAcknowledged(state)).toBe(true);
    state = setAiUrlAcknowledged(state, "menuUrl", false);
    expect(allAiUrlsAcknowledged(state)).toBe(false);
  });

  test("a user edit lifts the requirement without an explicit acknowledgment", () => {
    let state = markAiUrlSuggested(initAiUrlAck(FIELDS), "bookingUrl");
    state = liftAiUrlAckOnUserEdit(state, "bookingUrl");
    expect(allAiUrlsAcknowledged(state)).toBe(true);
  });

  test("transitions preserve identity when nothing changes", () => {
    const initial = initAiUrlAck(FIELDS);
    expect(liftAiUrlAckOnUserEdit(initial, "menuUrl")).toBe(initial);
    expect(setAiUrlAcknowledged(initial, "menuUrl", true)).toBe(initial);
    const suggested = markAiUrlSuggested(initial, "menuUrl");
    expect(markAiUrlSuggested(suggested, "menuUrl")).toBe(suggested);
  });
});
