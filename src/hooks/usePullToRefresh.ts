import { useEffect, useRef, useState } from 'react';

interface Options {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  maxPull?: number;
  enabled?: boolean;
}

/**
 * Pull-to-refresh hook for mobile. Activates only when the page is scrolled
 * to the very top and the user drags down with a touch gesture.
 * Returns the current pull distance (px) and whether a refresh is in flight.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull = 120,
  enabled = true,
}: Options) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      // Only engage when scrolled to the very top.
      if (window.scrollY > 0) {
        startY.current = null;
        tracking.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current || startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Apply resistance for a natural feel.
      const resisted = Math.min(maxPull, dy * 0.5);
      setPull(resisted);
    };

    const onTouchEnd = async () => {
      if (!tracking.current) return;
      tracking.current = false;
      const reached = pull >= threshold;
      if (reached && !refreshing) {
        setRefreshing(true);
        setPull(threshold);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
      startY.current = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, onRefresh, threshold, maxPull, pull, refreshing]);

  return { pull, refreshing, threshold };
}