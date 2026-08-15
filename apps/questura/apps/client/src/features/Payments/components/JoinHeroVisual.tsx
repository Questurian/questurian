'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';
import Image from 'next/image';

/*
 * Flight routes drawn over the hero globe. Coordinates are in the globe
 * image's pixel space (3840x2160) so the origins stay pinned to the US
 * hub cities as the globe drifts.
 */
const flightRoutes = [
  // NYC → Europe (east): climbs hard early, flattens over the Atlantic
  { d: 'M2210 560 C2400 340 2780 330 3060 500', duration: '6.4s', delay: '-1.8s' },
  // NYC → Brazil (south): pushes offshore first, then straightens due south
  { d: 'M2210 560 C2430 690 2480 1010 2450 1340', duration: '6.1s', delay: '-0.9s' },
  // Miami → West Africa (east): low-slung lazy arc
  { d: 'M2145 745 C2380 705 2740 745 2960 870', duration: '7s', delay: '-4.6s' },
  // Miami → Peru / Chile (south): hugs the coast, bends out late
  { d: 'M2145 745 C2110 1000 2230 1300 2380 1545', duration: '5.9s', delay: '-3.7s' },
  // Miami → eastern Brazil (south): bulges east early, eases in
  { d: 'M2145 745 C2360 820 2540 1070 2575 1330', duration: '7.3s', delay: '-0.3s' },
  // Texas → Central / South America (south): leans west before swinging in
  { d: 'M1850 655 C1795 890 1890 1250 2070 1490', duration: '6.4s', delay: '-2.5s' },
  // LA → Pacific (west): dives steeply, levels off far out
  { d: 'M1640 620 C1430 430 1080 430 800 545', duration: '6.7s', delay: '-3.1s' },
  // LA → Mexico and south: near-straight with a gentle drift east
  { d: 'M1640 620 C1615 850 1690 1180 1785 1440', duration: '6.9s', delay: '-5.4s' },
  // Chicago → Europe (east): high flat-topped polar arc
  { d: 'M2040 545 C2260 300 2680 290 2915 440', duration: '6.8s', delay: '-5s' },
  // Seattle → Pacific / Asia (northwest): lifts toward the pole, fades at the limb
  { d: 'M1680 445 C1430 330 1110 280 825 340', duration: '6.6s', delay: '-2.2s' },
];

/*
 * Jet silhouette drawn nose-up in a 24x24 box. The comet group's
 * offset-rotate: auto points its +x axis along the route, so the plane is
 * rotated 90° to face the direction of travel.
 */
const planePath =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

const flightHubs = [
  { cx: 2210, cy: 560, delay: '0s' }, // NYC
  { cx: 2145, cy: 745, delay: '-0.8s' }, // Miami
  { cx: 1850, cy: 655, delay: '-1.6s' }, // Texas
  { cx: 1640, cy: 620, delay: '-2.4s' }, // LA
  { cx: 2040, cy: 545, delay: '-3.2s' }, // Chicago
  { cx: 1680, cy: 445, delay: '-4s' }, // Seattle
];

function revealDecodedImage(
  img: HTMLImageElement,
  reveal: () => void,
) {
  if (typeof img.decode === 'function') {
    void img.decode().then(reveal, reveal);
    return;
  }
  reveal();
}

export default function JoinHeroVisual() {
  const [ready, setReady] = useState(false);
  const globeRef = useRef<HTMLImageElement | null>(null);

  const reveal = useCallback(() => {
    setReady(true);
  }, []);

  const handleGlobeReady = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      revealDecodedImage(event.currentTarget, reveal);
    },
    [reveal],
  );

  useEffect(() => {
    const img = globeRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      revealDecodedImage(img, reveal);
    }
  }, [reveal]);

  useEffect(() => {
    if (ready) return;
    const timeoutId = window.setTimeout(reveal, 6000);
    return () => window.clearTimeout(timeoutId);
  }, [ready, reveal]);

  return (
    <section
      className={`join-hero${ready ? ' is-ready' : ''}`}
      aria-labelledby="join-hero-title"
    >
    <div className="join-hero-visual" aria-hidden="true">
      <div className="join-hero-visual-stage">
        <Image
          ref={globeRef}
          src="/images/join/questurian-globe.png"
          alt=""
          width={3840}
          height={2160}
          priority
          sizes="(max-width: 768px) 1000px, (max-width: 1536px) 100vw, 1650px"
          className="join-hero-globe-image"
          onLoad={handleGlobeReady}
          onError={reveal}
        />

        <div className="join-hero-routes">
          <svg
            viewBox="0 0 3840 2160"
            className="join-hero-routes-svg"
            fill="none"
          >
            <defs>
              {/* Glow is baked into gradients so no CSS filters are needed */}
              <radialGradient id="join-glow-dot">
                <stop offset="0" stopColor="#4ee8d8" stopOpacity="0.55" />
                <stop offset="1" stopColor="#4ee8d8" stopOpacity="0" />
              </radialGradient>
              {/* Fades left (flame tip) → right (engine), in local coords */}
              <linearGradient id="join-exhaust" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#4ee8d8" stopOpacity="0" />
                <stop offset="0.55" stopColor="#7df0e2" stopOpacity="0.4" />
                <stop offset="1" stopColor="#eafffb" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            {flightRoutes.map((route) => {
              const routeVars = {
                '--route-duration': route.duration,
                '--route-delay': route.delay,
              } as CSSProperties;
              return (
                <g key={route.d}>
                  <path
                    d={route.d}
                    pathLength={100}
                    className="join-route-trail"
                    style={routeVars}
                  />
                  <g
                    className="join-route-comet"
                    style={
                      {
                        offsetPath: `path("${route.d}")`,
                        ...routeVars,
                      } as CSSProperties
                    }
                  >
                    <circle r={16} fill="url(#join-glow-dot)" />
                    {/*
                     * Afterburner: a short tapered flame in the group's
                     * local space (+x is the direction of travel, so it
                     * trails off toward -x, just behind the fuselage).
                     */}
                    <path
                      className="join-route-exhaust"
                      d="M-12 2.4 Q-24 1.3 -34 0 Q-24 -1.3 -12 -2.4 Z"
                      fill="url(#join-exhaust)"
                    />
                    <path
                      d={planePath}
                      fill="#b9fff5"
                      transform="rotate(90) scale(1.5) translate(-11.5 -12)"
                    />
                  </g>
                </g>
              );
            })}
            {flightHubs.map((hub) => (
              <g key={`${hub.cx}-${hub.cy}`}>
                <circle
                  className="join-hub-halo"
                  cx={hub.cx}
                  cy={hub.cy}
                  r={26}
                  style={{ '--hub-delay': hub.delay } as CSSProperties}
                />
                <circle
                  cx={hub.cx}
                  cy={hub.cy}
                  r={22}
                  fill="url(#join-glow-dot)"
                />
                <circle
                  className="join-hub-dot"
                  cx={hub.cx}
                  cy={hub.cy}
                  r={9}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>

    <div className="join-hero-copy">
      <h1 id="join-hero-title" className="join-hero-title">
        <span>Know more.</span>{' '}
        <em>Travel better.</em>
      </h1>
    </div>
    </section>
  );
}
