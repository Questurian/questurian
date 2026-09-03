import { getSettingValue, setSettingValue } from "./app-settings.repository";

const LIMIT_KEY = "instagram_api_request_limit";
const REMAINING_KEY = "instagram_api_requests_remaining";

export interface InstagramApiQuota {
  limit: number | null;
  remaining: number | null;
}

function parseCount(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function getInstagramApiQuota(): InstagramApiQuota {
  return {
    limit: parseCount(getSettingValue(LIMIT_KEY)),
    remaining: parseCount(getSettingValue(REMAINING_KEY)),
  };
}

export function setInstagramApiQuota(quota: InstagramApiQuota): void {
  if (quota.limit !== null) setSettingValue(LIMIT_KEY, String(quota.limit));
  if (quota.remaining !== null) setSettingValue(REMAINING_KEY, String(quota.remaining));
}
