"use client";

import DesktopNavbar from "./Desktop/DesktopNavbar";
import MobileNavbar from "./Mobile/MobileNavbar";
import { useEffect, useRef } from "react";

// Virtual scroll pixels that the navbar "consumes" before the page moves.
// Wheel input is partitioned: first ABSORB_PX go entirely to the animation,
// then the remainder flows to actual page scroll at full speed.
const ABSORB_PX = 120;

// Lerp factor: how fast the rendered value chases the target each frame.
// Lower = smoother / more lag. 0.09 gives a nice trailing feel.
const LERP = 0.09;

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let rafId = 0;
    let virtualY = 0;      // accumulated wheel intent (not real scrollY)
    let currentVal = 0;    // lerp-smoothed value written to CSS
    let targetVal = 0;     // instant target from wheel input

    // Lerp loop. It runs only while the rendered value is still chasing the
    // target; once it has snapped to an endpoint there is nothing left to
    // write, so it stops instead of burning a frame forever. `wake` restarts
    // it whenever new input moves the target.
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

    const handleWheel = (e: WheelEvent) => {
      const prev = virtualY;
      virtualY = Math.max(0, virtualY + e.deltaY);
      targetVal = Math.min(1, virtualY / ABSORB_PX);
      wake();

      // While the navbar hasn't fully collapsed yet, absorb scroll into the
      // animation. Only the delta that exceeds the absorption budget reaches
      // the page — this makes the page feel slow while the nav animates.
      if (virtualY < ABSORB_PX && e.deltaY > 0) {
        e.preventDefault();
        // Let through only the fraction beyond what was already scrolled.
        const overflow = Math.max(0, (virtualY - prev) - (ABSORB_PX - prev));
        if (overflow > 0) window.scrollBy({ top: overflow });
      } else if (e.deltaY < 0 && window.scrollY === 0) {
        // Scrolling back up at the top resets the virtual accumulator.
        e.preventDefault();
      }
    };

    // Keyboard / programmatic scrolls still need to sync targetVal.
    const handleScroll = () => {
      if (window.scrollY === 0) {
        virtualY = 0;
        targetVal = 0;
        wake();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
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
