import { useCallback, useEffect, useState } from "react";
import type { PhotoImportPhoto } from "@questurian/lm-shared";
import { addFlowPhotoSession } from "../../lib/add-flow-photo-session";
import {
  defaultSelectedPhotos,
  persistedToCropped,
} from "./photo-import-crop.utils";
import type {
  PhotoImportSessionState,
  SourceCard,
} from "./photo-import-phase.types";

interface UsePhotoImportSessionOptions {
  photos: PhotoImportPhoto[];
  category: string;
  onSessionChange: (session: PhotoImportSessionState) => void;
}

export function usePhotoImportSession({
  photos,
  category,
  onSessionChange,
}: UsePhotoImportSessionOptions) {
  const [subPhase, setSubPhase] = useState<"select" | "crop">("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<Map<string, SourceCard>>(new Map());
  const [sessionId] = useState(() => addFlowPhotoSession.newSessionId());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await addFlowPhotoSession.registerSession(sessionId, category);
        const persisted = await addFlowPhotoSession.loadSession(sessionId);
        if (cancelled || persisted.size === 0) return;
        setCards((current) => {
          const next = new Map(current);
          for (const [name, entry] of persisted.entries()) {
            const cropped = persistedToCropped(entry);
            if (!cropped) continue;
            next.set(name, {
              name,
              previewUrl: current.get(name)?.previewUrl ?? null,
              authorDisplayName: current.get(name)?.authorDisplayName ?? null,
              uiStatus: "cropped",
              errorMessage: null,
              cropped,
            });
          }
          return next;
        });
      } catch (error) {
        console.warn("[PhotoImportPhase] IDB restore failed", error);
      }
      void addFlowPhotoSession.pruneOlderThan().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [category, sessionId]);

  useEffect(() => {
    if (photos.length === 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelected((current) => (
        current.size === 0 ? defaultSelectedPhotos(photos) : current
      ));
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  useEffect(() => {
    const cropped = Array.from(selected)
      .map((name) => cards.get(name)?.cropped)
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    onSessionChange({
      sessionId,
      selected: Array.from(selected),
      cropped,
      ready: selected.size > 0 && cropped.length === selected.size,
    });
  }, [cards, onSessionChange, selected, sessionId]);

  const togglePhoto = useCallback((name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectPhotos = useCallback((names: string[]) => {
    setSelected(new Set(names));
  }, []);

  const goToCrop = useCallback(() => {
    setCards((current) => {
      const next = new Map(current);
      for (const photo of photos) {
        if (!selected.has(photo.name) || next.has(photo.name)) continue;
        next.set(photo.name, {
          name: photo.name,
          previewUrl: photo.previewUrl ?? null,
          authorDisplayName: photo.authorAttributions[0]?.displayName ?? null,
          uiStatus: "idle",
          errorMessage: null,
          cropped: null,
        });
      }
      return next;
    });
    setSubPhase("crop");
  }, [photos, selected]);

  const removeSource = useCallback((sourceName: string) => {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(sourceName);
      return next;
    });
    setCards((current) => {
      const next = new Map(current);
      next.delete(sourceName);
      return next;
    });
    void addFlowPhotoSession.removeSource(sessionId, sourceName).catch(() => undefined);
  }, [sessionId]);

  return {
    sessionId,
    subPhase,
    setSubPhase,
    selected,
    cards,
    setCards,
    togglePhoto,
    selectPhotos,
    goToCrop,
    removeSource,
  };
}
