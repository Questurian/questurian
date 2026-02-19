import { useCallback, useState } from "react";
import type { LocationBasic } from "@client/shared/services/api/types";

const STORAGE_KEY = "lm:expandedLocationKeys";

type LocationExpansionTarget = Pick<LocationBasic, "id" | "category">;

function buildLocationStorageKey(location: LocationExpansionTarget): string {
  return `${location.category}:${location.id}`;
}

function readExpandedLocationKeys(): Set<string> {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const validKeys = parsed.filter((value): value is string => typeof value === "string");
    return new Set(validKeys);
  } catch {
    return new Set();
  }
}

function writeExpandedLocationKeys(keys: Set<string>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys)));
}

export function useLocationExpansionState() {
  const [expandedLocationKeys, setExpandedLocationKeys] = useState<Set<string>>(() =>
    readExpandedLocationKeys()
  );

  const isExpanded = useCallback(
    (location: LocationExpansionTarget) =>
      expandedLocationKeys.has(buildLocationStorageKey(location)),
    [expandedLocationKeys]
  );

  const setExpanded = useCallback(
    (location: LocationExpansionTarget, expanded: boolean) => {
      setExpandedLocationKeys((previousKeys) => {
        const nextKeys = new Set(previousKeys);
        const key = buildLocationStorageKey(location);

        if (expanded) {
          nextKeys.add(key);
        } else {
          nextKeys.delete(key);
        }

        writeExpandedLocationKeys(nextKeys);
        return nextKeys;
      });
    },
    []
  );

  const clearExpanded = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setExpandedLocationKeys(new Set());
  }, []);

  return { isExpanded, setExpanded, clearExpanded };
}
