'use client';

import { useRef, useState, useCallback } from 'react';

const THRESHOLD = 70;
const MAX_PULL = 100;

// The window scrolls, not the wrapper, so both are checked. Pulls only count from the very top.
const atTop = (el) => window.scrollY <= 0 && (!el || el.scrollTop <= 0);

// Returns the ref separately so components never read it during render.
export default function usePullToRefresh(onRefresh) {
  const scrollRef = useRef(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e) => {
    if (!atTop(scrollRef.current)) {
      pullingRef.current = false;
      return;
    }
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pullingRef.current) return;
    if (!atTop(scrollRef.current)) {
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    setPullDistance(delta <= 0 ? 0 : Math.min(delta * 0.4, MAX_PULL));
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullDistance < THRESHOLD) {
      setPullDistance(0);
      return;
    }
    setRefreshing(true);
    setPullDistance(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  return [scrollRef, { pullDistance, refreshing, onTouchStart, onTouchMove, onTouchEnd, THRESHOLD }];
}
