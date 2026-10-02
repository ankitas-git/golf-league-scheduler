'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Calendar, Users, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import DateFilter from '@/components/admin/DateFilter';
import ExportButton from '@/components/admin/ExportButton';
import AvailabilityCard from '@/components/availability/AvailabilityCard';
import { createPageUrl } from '@/utils';
import Link from 'next/link';

export default function AdminDashboard({ user }) {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const { data: allAvailabilities = [], isLoading } = useQuery({
    queryKey: ['all-availabilities'],
    queryFn: () => api.entities.Availability.list('date'),
    enabled: user?.role === 'admin',
  });

  // Real-time updates
  useEffect(() => {
    if (user?.role !== 'admin') return;
    
    const unsubscribe = api.entities.Availability.subscribe((event) => {
      api.entities.Availability.list('date').then(data => {
        queryClient.setQueryData(['all-availabilities'], data);
      });
    });
    
    return unsubscribe;
  }, [user, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Availability.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-availabilities'] });
    },
  });

  const filteredAvailabilities = useMemo(() => {
    if (!startDate && !endDate) return allAvailabilities;
    
    return allAvailabilities.filter(a => {
      const date = parseISO(a.date);
      if (startDate && endDate) {
        return isWithinInterval(date, { start: startOfDay(startDate), end: endOfDay(endDate) });
      }
      if (startDate) return date >= startOfDay(startDate);
      if (endDate) return date <= endOfDay(endDate);
      return true;
    });
  }, [allAvailabilities, startDate, endDate]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups = {};
    filteredAvailabilities.forEach(a => {
      if (!groups[a.date]) {
        groups[a.date] = [];
      }
      groups[a.date].push(a);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredAvailabilities]);

  const uniquePlayers = useMemo(() => {
    const emails = new Set(filteredAvailabilities.map(a => a.player_email));
    return emails.size;
  }, [filteredAvailabilities]);

  if (!user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg border border-red-100 p-8 max-w-md text-center"
        >
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500 mb-6">
            This dashboard is only accessible to administrators.
          </p>
          <Link 
            href={createPageUrl('PlayerDashboard')}
            className="inline-flex items-center justify-center h-10 px-6 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
          >
            Go to Player Dashboard
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-emerald-50">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-200">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Admin Dashboard
                </h1>
                <p className="text-gray-500">
                  View all player availability
                </p>
              </div>
            </div>
            <ExportButton data={filteredAvailabilities} filename="golf-availability" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{filteredAvailabilities.length}</p>
                  <p className="text-sm text-gray-500">Total Entries</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{uniquePlayers}</p>
                  <p className="text-sm text-gray-500">Players</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{groupedByDate.length}</p>
                  <p className="text-sm text-gray-500">Unique Dates</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <DateFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onClear={() => {
                setStartDate(null);
                setEndDate(null);
              }}
            />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : groupedByDate.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No availability found</p>
            <p className="text-sm text-gray-400">
              {startDate || endDate ? 'Try adjusting your date filters' : 'Players haven\'t added any availability yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <AnimatePresence>
              {groupedByDate.map(([date, items]) => (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                >
                  <div className="bg-linear-to-r from-emerald-600 to-emerald-700 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="text-white">
                        <p className="text-lg font-semibold">
                          {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                        </p>
                      </div>
                      <div className="bg-white/20 rounded-lg px-3 py-1">
                        <span className="text-white font-medium">
                          {items.length} player{items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((availability) => (
                      <AvailabilityCard
                        key={availability.id}
                        availability={availability}
                        showPlayer={true}
                        canDelete={true}
                        onDelete={(id) => deleteMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}