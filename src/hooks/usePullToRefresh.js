'use client';

import { useRef, useState, useCallback } from 'react';

export default function usePullToRefresh(onRefresh) {
  const scrollRef = useRef(null);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const THRESHOLD = 70;
  const MAX_PULL = 100;

  const onTouchStart = useCallback((e) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      pullingRef.current = false;
      return;
    }
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pullingRef.current) return;
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) {
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    // Dampen the pull
    const dampened = Math.min(delta * 0.4, MAX_PULL);
    setPullDistance(dampened);
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  const spinnerSize = Math.min(pullDistance / THRESHOLD, 1);
  const spinnerRotation = pullDistance * 3;

  return {
    scrollRef,
    pullDistance,
    refreshing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    spinnerSize,
    spinnerRotation,
    THRESHOLD,
  };
}