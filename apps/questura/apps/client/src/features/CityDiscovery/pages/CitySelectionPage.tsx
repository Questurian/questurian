'use client';

import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { CityCard } from '../components/CityCard';
import { cities } from '../lib/data';

type CardVariant = 'default' | 'featured';
type FeaturedCity = 'lima' | 'medellin';

interface LayoutSlot {
  className: string;
  variant: CardVariant;
}

const TOP_GRID_ANIMATION_DELAYS = ['0.5s', '0.57s', '0.64s', '0.71s', '0.78s', '0.85s'];
const FLIP_DURATION_MS = 620;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const TOP_GRID_CITIES = cities.slice(0, 6);
const HOVER_FEATURE_CITY_BY_ID: Partial<Record<string, FeaturedCity>> = {
  lima: 'lima',
  medellin: 'medellin',
};

function resetCardMotionStyles(cardElement: HTMLDivElement) {
  cardElement.style.transition = '';
  cardElement.style.transform = '';
  cardElement.style.transformOrigin = '';
  cardElement.style.willChange = '';
  cardElement.style.zIndex = '';
}

const LAYOUT_ONE_SLOTS: LayoutSlot[] = [
  {
    className: '380:col-span-2 1024:col-span-2 1024:row-span-2 1024:col-start-1 1024:row-start-1',
    variant: 'featured',
  },
  {
    className: '1024:col-start-3 1024:row-start-1',
    variant: 'default',
  },
  {
    className: '1024:col-start-3 1024:row-start-2',
    variant: 'default',
  },
  {
    className: '1024:col-start-1 1024:row-start-3',
    variant: 'default',
  },
  {
    className: '1024:col-start-2 1024:row-start-3',
    variant: 'default',
  },
  {
    className: '1024:col-start-3 1024:row-start-3',
    variant: 'default',
  },
];

const LAYOUT_TWO_SLOTS: LayoutSlot[] = [
  {
    className: '1024:col-start-1 1024:row-start-1',
    variant: 'default',
  },
  {
    className: '1024:col-span-2 1024:row-span-2 1024:col-start-2 1024:row-start-1',
    variant: 'featured',
  },
  {
    className: '1024:col-start-1 1024:row-start-2',
    variant: 'default',
  },
  {
    className: '1024:col-start-1 1024:row-start-3',
    variant: 'default',
  },
  {
    className: '1024:col-start-2 1024:row-start-3',
    variant: 'default',
  },
  {
    className: '1024:col-start-3 1024:row-start-3',
    variant: 'default',
  },
];

function CitySelectionContent() {
  const router = useRouter();
  const [showDevReference, setShowDevReference] = useState(false);
  const [featuredCity, setFeaturedCity] = useState<FeaturedCity>('lima');
  const featuredCityRef = useRef<FeaturedCity>('lima');
  const isLayoutTransitioningRef = useRef(false);
  const topCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingFirstRectsRef = useRef<Map<string, DOMRect> | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const isDevMode = process.env.NODE_ENV !== 'production';
  const activeLayoutSlots = featuredCity === 'medellin' ? LAYOUT_TWO_SLOTS : LAYOUT_ONE_SLOTS;

  const handleCitySelect = (cityId: string) => {
    router.push(`/step-2?city=${cityId}`);
  };

  const setTopCardRef = (cityId: string) => (element: HTMLDivElement | null) => {
    topCardRefs.current[cityId] = element;
  };

  const runLayoutTransition = (nextFeaturedCity: FeaturedCity) => {
    if (nextFeaturedCity === featuredCityRef.current) {
      isLayoutTransitioningRef.current = false;
      return;
    }

    if (typeof window === 'undefined') {
      featuredCityRef.current = nextFeaturedCity;
      setFeaturedCity(nextFeaturedCity);
      isLayoutTransitioningRef.current = false;
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      featuredCityRef.current = nextFeaturedCity;
      setFeaturedCity(nextFeaturedCity);
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
    setFeaturedCity(nextFeaturedCity);
  };

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
  }, [featuredCity]);

  const requestFeaturedCity = (nextFeaturedCity: FeaturedCity) => {
    if (isLayoutTransitioningRef.current) {
      return;
    }

    isLayoutTransitioningRef.current = true;
    runLayoutTransition(nextFeaturedCity);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Header */}
      <header className="px-4 480:px-6 768:px-10 1024:px-16 py-5 768:py-8 animate-fade-in-down">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 480:w-10 480:h-10 bg-[#C65D3B] rounded-full flex items-center justify-center">
              <MapPin className="w-4 h-4 480:w-5 480:h-5 text-white" />
            </div>
            <span className="text-xl 480:text-2xl font-semibold tracking-tight text-[#1A1A1A]">
              Questurian
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            {isDevMode ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDevReference(current => !current)}
                  className="text-[10px] 480:text-xs uppercase tracking-wide px-3 py-1.5 rounded-full border border-[#1A1A1A]/25 text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:border-[#1A1A1A]/40 transition-colors"
                >
                  {showDevReference ? 'Hide Dev Reference' : 'Show Dev Reference'}
                </button>
              </div>
            ) : null}
            <span className="text-xs text-[#1A1A1A]/40 tracking-wider uppercase hidden 550:block">
              Step 1 of 3
            </span>
            <div className="w-16 550:w-24 h-1 bg-[#1A1A1A]/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#C65D3B] rounded-full w-1/3 transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 480:px-6 768:px-10 1024:px-16 pb-12 768:pb-20">
        {/* Hero Text */}
        <div className="max-w-4xl mb-8 480:mb-10 768:mb-14 1024:mb-16">
          <p
            className="text-[#C65D3B] text-xs 480:text-sm tracking-[0.2em] uppercase mb-3 animate-slide-in-right"
            style={{ animationDelay: '0.1s' }}
          >
            Choose your destination
          </p>
          <h1
            className="text-4xl 480:text-5xl 768:text-6xl 1024:text-7xl font-display text-[#1A1A1A] leading-[0.95] tracking-tight animate-text-reveal"
            style={{ animationDelay: '0.2s' }}
          >
            Where to
            <br />
            <span className="italic">next?</span>
          </h1>
          <p
            className="mt-4 480:mt-5 768:mt-6 text-sm 480:text-base 768:text-lg text-[#1A1A1A]/60 max-w-lg leading-relaxed animate-fade-in-up"
            style={{ animationDelay: '0.4s' }}
          >
            Select a city that resonates with your rhythm. Each destination offers a unique way of life.
          </p>
        </div>

        {/* City Grid - Mobile-first progressive layout */}
        <div className="grid grid-cols-1 380:grid-cols-2 1024:grid-cols-3 gap-3 480:gap-4 768:gap-5 1024:gap-6">
          {TOP_GRID_CITIES.map((city, index) => (
            <div
              key={city.id}
              ref={setTopCardRef(city.id)}
              className={activeLayoutSlots[index].className}
              onMouseEnter={
                HOVER_FEATURE_CITY_BY_ID[city.id]
                  ? () => requestFeaturedCity(HOVER_FEATURE_CITY_BY_ID[city.id]!)
                  : undefined
              }
            >
              <CityCard
                city={city}
                onSelect={handleCitySelect}
                variant={activeLayoutSlots[index].variant}
                style={{ animationDelay: TOP_GRID_ANIMATION_DELAYS[index] }}
              />
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <p
          className="mt-10 768:mt-16 text-center text-[#1A1A1A]/40 text-xs 768:text-sm tracking-wide animate-fade-in"
          style={{ animationDelay: '1.1s' }}
        >
          More destinations launching soon
        </p>

        {isDevMode && showDevReference ? (
          <section className="mt-12 768:mt-20 pt-10 768:pt-14 border-t border-[#1A1A1A]/10">
            <div className="max-w-4xl mb-8 480:mb-10 768:mb-14 1024:mb-16">
              <p className="text-[#C65D3B] text-xs 480:text-sm tracking-[0.2em] uppercase mb-3">
                Dev reference
              </p>
              <h2 className="text-3xl 480:text-4xl 768:text-5xl 1024:text-6xl font-display text-[#1A1A1A] leading-[0.95] tracking-tight">
                Where to
                <br />
                <span className="italic">next?</span>
              </h2>
              <p className="mt-4 480:mt-5 768:mt-6 text-sm 480:text-base 768:text-lg text-[#1A1A1A]/60 max-w-lg leading-relaxed">
                Select a city that resonates with your rhythm. Each destination offers a unique way of life.
              </p>
            </div>

            <div className="grid grid-cols-1 380:grid-cols-2 1024:grid-cols-3 gap-3 480:gap-4 768:gap-5 1024:gap-6">
              <div className="1024:col-start-1 1024:row-start-1">
                <CityCard
                  city={cities[0]}
                  onSelect={handleCitySelect}
                />
              </div>

              <div className="1024:col-span-2 1024:row-span-2 1024:col-start-2 1024:row-start-1">
                <CityCard
                  city={cities[1]}
                  onSelect={handleCitySelect}
                  variant="featured"
                />
              </div>

              <div className="1024:col-start-1 1024:row-start-2">
                <CityCard
                  city={cities[2]}
                  onSelect={handleCitySelect}
                />
              </div>

              <div className="1024:col-start-1 1024:row-start-3">
                <CityCard
                  city={cities[3]}
                  onSelect={handleCitySelect}
                />
              </div>

              <div className="1024:col-start-2 1024:row-start-3">
                <CityCard
                  city={cities[4]}
                  onSelect={handleCitySelect}
                />
              </div>

              <div className="1024:col-start-3 1024:row-start-3">
                <CityCard
                  city={cities[5]}
                  onSelect={handleCitySelect}
                />
              </div>
            </div>

            <p className="mt-10 768:mt-16 text-center text-[#1A1A1A]/40 text-xs 768:text-sm tracking-wide">
              More destinations launching soon
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export function CitySelectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#C65D3B] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CitySelectionContent />
    </Suspense>
  );
}
