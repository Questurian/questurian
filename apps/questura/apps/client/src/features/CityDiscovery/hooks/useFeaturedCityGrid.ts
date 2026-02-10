'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  CANONICAL_FEATURED_CITY,
  FLIP_DURATION_MS,
  FLIP_EASING,
  type FeaturedCityId,
  type GridCell,
  type LayoutRequest,
  type LayoutRequestMode,
  TOP_GRID_CITIES,
  resolveLayoutSlots,
} from '../lib/cityGridLayout';

function resetCardMotionStyles(cardElement: HTMLDivElement) {
  cardElement.style.transition = '';
  cardElement.style.transform = '';
  cardElement.style.transformOrigin = '';
  cardElement.style.willChange = '';
  cardElement.style.zIndex = '';
}

export function useFeaturedCityGrid() {
  const [featuredCity, setFeaturedCity] = useState<FeaturedCityId>(CANONICAL_FEATURED_CITY);
  const [featuredAnchorCell, setFeaturedAnchorCell] = useState<GridCell | null>(null);
  const featuredCityRef = useRef<FeaturedCityId>(CANONICAL_FEATURED_CITY);
  const featuredAnchorCellRef = useRef<GridCell | null>(null);
  const isLayoutTransitioningRef = useRef(false);
  const pendingLayoutRequestRef = useRef<LayoutRequest | null>(null);
  const runLayoutTransitionRef = useRef<(nextFeaturedCity: FeaturedCityId, mode: LayoutRequestMode) => void>(
    () => undefined
  );
  const topCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingFirstRectsRef = useRef<Map<string, DOMRect> | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const activeLayoutSlotsById = resolveLayoutSlots(featuredCity, featuredAnchorCell ?? undefined);

  const setTopCardRef = (cityId: string) => (element: HTMLDivElement | null) => {
    topCardRefs.current[cityId] = element;
  };

  const runLayoutTransition = (nextFeaturedCity: FeaturedCityId, mode: LayoutRequestMode) => {
    const isAlreadyInRequestedLayout =
      mode === 'canonical'
        ? nextFeaturedCity === featuredCityRef.current && featuredAnchorCellRef.current === null
        : nextFeaturedCity === featuredCityRef.current;

    if (isAlreadyInRequestedLayout) {
      isLayoutTransitioningRef.current = false;
      return;
    }

    const nextAnchorCell =
      mode === 'canonical'
        ? null
        : (() => {
            const currentLayout = resolveLayoutSlots(
              featuredCityRef.current,
              featuredAnchorCellRef.current ?? undefined
            );
            const currentSlot = currentLayout[nextFeaturedCity];

            return {
              col: currentSlot.colStart,
              row: currentSlot.rowStart,
            } as GridCell;
          })();

    if (typeof window === 'undefined') {
      featuredCityRef.current = nextFeaturedCity;
      featuredAnchorCellRef.current = nextAnchorCell;
      setFeaturedCity(nextFeaturedCity);
      setFeaturedAnchorCell(nextAnchorCell);
      isLayoutTransitioningRef.current = false;
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      featuredCityRef.current = nextFeaturedCity;
      featuredAnchorCellRef.current = nextAnchorCell;
      setFeaturedCity(nextFeaturedCity);
      setFeaturedAnchorCell(nextAnchorCell);
      isLayoutTransitioningRef.current = false;
      return;
    }

    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    TOP_GRID_CITIES.forEach((city) => {
      const cardElement = topCardRefs.current[city.id];
      if (!cardElement) {
        return;
      }

      cardElement.getAnimations().forEach((animation) => animation.cancel());
      resetCardMotionStyles(cardElement);
    });

    const firstRects = new Map<string, DOMRect>();

    TOP_GRID_CITIES.forEach((city) => {
      const cardElement = topCardRefs.current[city.id];
      if (cardElement) {
        firstRects.set(city.id, cardElement.getBoundingClientRect());
      }
    });

    pendingFirstRectsRef.current = firstRects;
    featuredCityRef.current = nextFeaturedCity;
    featuredAnchorCellRef.current = nextAnchorCell;
    setFeaturedCity(nextFeaturedCity);
    setFeaturedAnchorCell(nextAnchorCell);
  };
  runLayoutTransitionRef.current = runLayoutTransition;

  useLayoutEffect(() => {
    return () => {
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const firstRects = pendingFirstRectsRef.current;

    if (!firstRects) {
      return;
    }

    pendingFirstRectsRef.current = null;

    const animatedElements: HTMLDivElement[] = [];
    const completedElements = new Set<HTMLDivElement>();
    const transitionEndListeners: Array<{
      element: HTMLDivElement;
      handler: (event: TransitionEvent) => void;
    }> = [];
    let completed = false;

    const finishTransition = () => {
      if (completed) {
        return;
      }

      completed = true;

      transitionEndListeners.forEach(({ element, handler }) => {
        element.removeEventListener('transitionend', handler);
      });

      animatedElements.forEach((element) => {
        resetCardMotionStyles(element);
      });

      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }

      pendingFirstRectsRef.current = null;
      isLayoutTransitioningRef.current = false;
      const pendingLayoutRequest = pendingLayoutRequestRef.current;
      pendingLayoutRequestRef.current = null;

      if (pendingLayoutRequest) {
        isLayoutTransitioningRef.current = true;
        runLayoutTransitionRef.current(pendingLayoutRequest.cityId, pendingLayoutRequest.mode);
      }
    };

    TOP_GRID_CITIES.forEach((city) => {
      const cardElement = topCardRefs.current[city.id];
      const firstRect = firstRects.get(city.id);

      if (!cardElement || !firstRect) {
        return;
      }

      const lastRect = cardElement.getBoundingClientRect();
      if (lastRect.width === 0 || lastRect.height === 0) {
        return;
      }

      const deltaX = firstRect.left - lastRect.left;
      const deltaY = firstRect.top - lastRect.top;
      const scaleX = firstRect.width / lastRect.width;
      const scaleY = firstRect.height / lastRect.height;

      const hasMeaningfulChange =
        Math.abs(deltaX) >= 0.5 ||
        Math.abs(deltaY) >= 0.5 ||
        Math.abs(scaleX - 1) >= 0.01 ||
        Math.abs(scaleY - 1) >= 0.01;

      if (!hasMeaningfulChange) {
        return;
      }

      cardElement.style.willChange = 'transform';
      cardElement.style.transformOrigin = 'top left';
      cardElement.style.transition = 'none';
      cardElement.style.zIndex = '10';
      cardElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
      animatedElements.push(cardElement);
    });

    if (animatedElements.length === 0) {
      finishTransition();
      return;
    }

    animatedElements.forEach((element) => {
      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') {
          return;
        }

        completedElements.add(element);
        if (completedElements.size === animatedElements.length) {
          finishTransition();
        }
      };

      transitionEndListeners.push({ element, handler: handleTransitionEnd });
      element.addEventListener('transitionend', handleTransitionEnd);
    });

    animatedElements.forEach((element) => {
      element.getBoundingClientRect();
    });

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = null;

      animatedElements.forEach((element) => {
        element.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
        element.style.transform = 'translate(0px, 0px) scale(1, 1)';
      });
    });

    transitionTimeoutRef.current = window.setTimeout(() => {
      finishTransition();
    }, FLIP_DURATION_MS + 160);
  }, [featuredCity, featuredAnchorCell?.col, featuredAnchorCell?.row]);

  const requestFeaturedCity = (nextFeaturedCity: FeaturedCityId, mode: LayoutRequestMode = 'hover') => {
    if (isLayoutTransitioningRef.current) {
      pendingLayoutRequestRef.current = { cityId: nextFeaturedCity, mode };
      return;
    }

    isLayoutTransitioningRef.current = true;
    runLayoutTransition(nextFeaturedCity, mode);
  };

  return {
    activeLayoutSlotsById,
    requestFeaturedCity,
    setTopCardRef,
  };
}
