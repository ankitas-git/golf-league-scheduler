'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { SETTINGS } from '@/lib/settings';

const DEFAULTS = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));

// Defaults show right away so nothing flickers while the real values load.
export default function useSettings() {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60 * 1000 });
  return { ...DEFAULTS, ...data };
}
