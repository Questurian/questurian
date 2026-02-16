import { TRIPADVISOR_PLACE_MESSAGES } from "../constants/tripadvisor-place.constants";

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseLocationIdParam(value: string | undefined): ParseResult<number> {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return { ok: false, error: TRIPADVISOR_PLACE_MESSAGES.invalidLocationId };
  }

  return { ok: true, value: parsed };
}
