'use client';

import { useEffect } from 'react';

import { GLOBE_ELEMENT_ID, HERO_READY_ATTRIBUTE } from './joinHeroGlobe';

/*
 * Fallback for the parse-time script in JoinHeroVisual. That script runs on a
 * real document load, but React does not execute inline scripts it renders on
 * a client-side navigation — and /join is linked from the navbars and the
 * footer, so without this the hero would stay hidden on those routes.
 */
export default function JoinHeroReady() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute(HERO_READY_ATTRIBUTE)) return;

    const globe = document.getElementById(
      GLOBE_ELEMENT_ID,
    ) as HTMLImageElement | null;
    if (!globe) return;

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      root.setAttribute(HERO_READY_ATTRIBUTE, '');
    };
    const decoded = () => {
      if (typeof globe.decode === 'function') {
        void globe.decode().then(reveal, reveal);
        return;
      }
      reveal();
    };

    if (globe.complete && globe.naturalWidth > 0) {
      decoded();
    } else {
      globe.addEventListener('load', decoded, { once: true });
      globe.addEventListener('error', reveal, { once: true });
    }

    const timeoutId = window.setTimeout(reveal, 2500);
    return () => {
      window.clearTimeout(timeoutId);
      globe.removeEventListener('load', decoded);
      globe.removeEventListener('error', reveal);
    };
  }, []);

  return null;
}
