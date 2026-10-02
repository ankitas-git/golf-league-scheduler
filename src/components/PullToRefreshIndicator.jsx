'use client';

import React from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

export default function PullToRefreshIndicator({ pullDistance, refreshing, threshold }) {
  if (pullDistance === 0 && !refreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all"
      style={{ height: refreshing ? 40 : pullDistance }}
    >
      {refreshing ? (
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
      ) : (
        <ArrowDown
          className="w-5 h-5 text-emerald-500 transition-transform"
          style={{
            transform: `rotate(${progress < 1 ? 0 : 180}deg) scale(${0.6 + progress * 0.4})`,
            opacity: 0.4 + progress * 0.6,
          }}
        />
      )}
    </div>
  );
}