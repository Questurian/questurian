import { useState, useCallback } from "react";

const STORAGE_KEY = "lm:lastOpenedLocationId";

export function useLastOpenedLocation() {
  const [lastOpenedId] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  const setLastOpened = useCallback((id: number) => {
    sessionStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const clearLastOpened = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return { lastOpenedId, setLastOpened, clearLastOpened };
}
