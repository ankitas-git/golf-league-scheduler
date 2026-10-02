'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Check, X, Loader2, UserCog } from 'lucide-react';

import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function AdminAvailabilityEditor({ teeTimes, availabilities }) {
  const queryClient = useQueryClient();
  const [golferNames, setGolferNames] = useState([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [pendingCells, setPendingCells] = useState(new Set()); // "name|date" keys

  useEffect(() => {
    api.functions.invoke('getGolferNames', {}).then(res => {
      if (res.data?.success) {
        const sorted = [...res.data.golferNames].sort((a, b) => {
          const lastA = a.trim().split(' ').slice(1).join(' ').toLowerCase();
          const lastB = b.trim().split(' ').slice(1).join(' ').toLowerCase();
          return lastA.localeCompare(lastB);
        });
        setGolferNames(sorted);
      }
    }).finally(() => setLoadingNames(false));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = [...new Set(
    teeTimes.filter(t => !t.notes?.includes('CLOSED')).map(t => (t.date || '').split('T')[0])
  )].filter(date => new Date(date + 'T00:00:00') >= today).sort((a, b) => new Date(a) - new Date(b));

  const getAvailability = (playerName, date) => {
    return availabilities.find(a =>
      a.player_name?.toLowerCase() === playerName.toLowerCase() &&
      (a.date || '').split('T')[0] === date
    );
  };

  const createMutation = useMutation({
    mutationFn: ({ playerName, date, teeTime }) => {
      return api.entities.Availability.create({
        date,
        player_name: playerName,
        start_time: teeTime?.start_time || null,
        end_time: teeTime?.end_time || null,
        notes: teeTime?.course ? `Course: ${teeTime.course}` : null,
      });
    },
    onSuccess: (_, { playerName, date }) => {
      queryClient.invalidateQueries({ queryKey: ['all-availability'] });
      toast.success(`Added ${playerName} for ${format(parseISO(date), 'M/d')}`);
    },
    onSettled: (_, __, { playerName, date }) => {
      setPendingCells(prev => { const n = new Set(prev); n.delete(`${playerName}|${date}`); return n; });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Availability.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['all-availability'] });
    },
    onSettled: (_, __, id) => {
      // clear pending after delete settles — we don't know the cell key here, handled per-click
    },
  });

  const handleCellClick = (playerName, date) => {
    const cellKey = `${playerName}|${date}`;
    if (pendingCells.has(cellKey)) return;

    const existing = getAvailability(playerName, date);
    setPendingCells(prev => new Set(prev).add(cellKey));

    if (existing) {
      deleteMutation.mutate(existing.id, {
        onSuccess: () => {
          toast.success(`Removed ${playerName} for ${format(parseISO(date), 'M/d')}`);
        },
        onSettled: () => {
          setPendingCells(prev => { const n = new Set(prev); n.delete(cellKey); return n; });
        },
      });
    } else {
      const teeTime = teeTimes.find(t => t.date === date);
      createMutation.mutate({ playerName, date, teeTime });
    }
  };

  if (loadingNames) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading golfer list...
      </div>
    );
  }

  if (golferNames.length === 0 || dates.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        No golfers or tee time dates available.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
      <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-b border-amber-100">
        <UserCog className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800">Edit Mode — Click any cell to toggle a player's availability</span>
      </div>
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 40, minWidth: 110, background: '#047857' }} className="text-white font-semibold px-4 py-3 text-left">First Name</th>
              <th style={{ position: 'sticky', top: 0, left: 110, zIndex: 40, minWidth: 110, background: '#047857' }} className="text-white font-semibold px-4 py-3 text-left">Last Name</th>
              {dates.map(date => (
                <th key={date} style={{ position: 'sticky', top: 0, zIndex: 20, background: '#047857' }} className="text-white font-semibold text-center whitespace-nowrap px-3 py-3">
                  {format(parseISO(date), 'M/d')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {golferNames.map((name, idx) => {
              const parts = name.trim().split(' ');
              const firstName = parts[0] || '';
              const lastName = parts.slice(1).join(' ') || '';
              const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
              return (
                <tr key={name} className="hover:bg-emerald-50/30 transition-colors">
                  <td style={{ position: 'sticky', left: 0, zIndex: 10, minWidth: 110, background: rowBg }} className="font-medium text-slate-700 px-4 py-2">{firstName}</td>
                  <td style={{ position: 'sticky', left: 110, zIndex: 10, minWidth: 110, background: rowBg }} className="font-medium text-slate-700 px-4 py-2">{lastName}</td>
                  {dates.map(date => {
                    const cellKey = `${name}|${date}`;
                    const isAvailable = !!getAvailability(name, date);
                    const isPending = pendingCells.has(cellKey);
                    return (
                      <td key={date} className="text-center p-1">
                        <button
                          onClick={() => handleCellClick(name, date)}
                          disabled={isPending}
                          className={cn(
                            "inline-flex items-center justify-center w-9 h-9 rounded-full transition-all cursor-pointer",
                            isAvailable
                              ? "bg-emerald-100 hover:bg-red-100 group"
                              : "bg-red-50 hover:bg-emerald-100 group",
                            isPending && "opacity-50 cursor-wait"
                          )}
                          title={isAvailable ? `Remove ${name}` : `Add ${name}`}
                        >
                          {isPending ? (
                            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                          ) : isAvailable ? (
                            <Check className="w-4 h-4 text-emerald-600 group-hover:hidden" />
                          ) : (
                            <X className="w-4 h-4 text-red-400" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}