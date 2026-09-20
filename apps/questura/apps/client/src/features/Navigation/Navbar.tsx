"use client";

import DesktopNavbar from "./Desktop/DesktopNavbar";
import MobileNavbar from "./Mobile/MobileNavbar";
import { useEffect, useRef } from "react";

// Scroll distance over which the navbar goes from expanded to collapsed. It is
// read off the real scroll position: the navbar never consumes input to
// animate itself, so the page moves at full speed from the first flick (#589).
const COLLAPSE_PX = 120;

// Lerp factor: how fast the rendered value chases the target each frame.
// Lower = smoother / more lag. 0.09 gives a nice trailing feel.
const LERP = 0.09;

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const collapseFromScroll = () =>
      Math.min(1, Math.max(0, window.scrollY / COLLAPSE_PX));

    let rafId = 0;
    let targetVal = collapseFromScroll(); // where the collapse should end up
    let currentVal = targetVal; // lerp-smoothed value written to CSS

    // Lerp loop. It runs only while the rendered value is still chasing the
    // target; once it has snapped to an endpoint there is nothing left to
    // write, so it stops instead of burning a frame forever. `wake` restarts
    // it whenever a scroll moves the target.
    const tick = () => {
      currentVal += (targetVal - currentVal) * LERP;
      if (targetVal === 1 && currentVal > 0.995) currentVal = 1;
      if (targetVal === 0 && currentVal < 0.005) currentVal = 0;

      const borderAlpha = currentVal === 0 || currentVal === 1 ? 0.1 : 0;
      document.documentElement.style.setProperty(
        "--navbar-collapse",
        String(currentVal)
      );
      document.documentElement.style.setProperty(
        "--navbar-border-alpha",
        String(borderAlpha)
      );

      if (currentVal === targetVal) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    // Idempotent: a loop that is already running is left alone.
    const wake = () => {
      if (rafId === 0) rafId = requestAnimationFrame(tick);
    };

    wake();

    // Observe, never consume. Every input -- wheel, trackpad, touch, PageDown,
    // Space, Home/End, scrollTo -- arrives here the same way.
    const handleScroll = () => {
      const next = collapseFromScroll();
      if (next === targetVal) return;
      targetVal = next;
      wake();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Keep --navbar-height in sync with the real nav height at every animation frame
  // so that consumers (e.g. the maps page sticky panel) can track it smoothly.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const setHeight = (h: number) =>
      document.documentElement.style.setProperty("--navbar-height", `${h}px`);

    setHeight(el.offsetHeight);

    const ro = new ResizeObserver((entries) => {
      const h =
        entries[0]?.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
      setHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={navRef} className="sticky top-0 z-40">
      <div className="hidden 1024:block">
        <DesktopNavbar />
      </div>
      <div className="h-[55px] 1024:hidden">
        <MobileNavbar />
      </div>
    </nav>
  );
}
