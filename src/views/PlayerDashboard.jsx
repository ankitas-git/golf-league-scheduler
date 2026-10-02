'use client';

import React, { useState } from 'react';
import { api } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isBefore, startOfDay, addMonths } from 'date-fns';
import { Calendar, Loader2, Clock } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';
import { playerKey } from '@/lib/players';
import AvailabilityCalendar from '@/components/availability/AvailabilityCalendar';
import AvailabilityCard from '@/components/availability/AvailabilityCard';
import TimeSelectionDialog from '@/components/availability/TimeSelectionDialog';

export default function PlayerDashboard({ user }) {
  // The page only renders for a signed in golfer, so the name comes from their account.
  const playerName = user.player_name;
  const playerEmail = playerKey(playerName);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewFilter, setViewFilter] = useState('month'); // 'month' or 'date'
  const [selectedViewDate, setSelectedViewDate] = useState(null);
  const [pendingDates, setPendingDates] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: myAvailabilities = [], isLoading: isLoadingMine } = useQuery({
    queryKey: ['my-availabilities', playerEmail],
    queryFn: () => api.entities.Availability.filter({ player_email: playerEmail }, 'date'),
    enabled: !!playerEmail,
  });

  const { data: allAvailabilities = [], isLoading: isLoadingAll } = useQuery({
    queryKey: ['all-availabilities'],
    queryFn: () => api.entities.Availability.list('date'),
  });

  const { data: teeTimes = [] } = useQuery({
    queryKey: ['tee-times'],
    queryFn: () => api.entities.TeeTime.list('date'),
  });





  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Availability.create({
      ...data,
      player_name: playerName,
      player_email: playerEmail,
    }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['my-availabilities', playerEmail] });
      const previous = queryClient.getQueryData(['my-availabilities', playerEmail]);
      queryClient.setQueryData(['my-availabilities', playerEmail], old => [
        ...(old || []),
        { ...variables, player_name: playerName, player_email: playerEmail, id: '__optimistic__' }
      ]);
      return { previous };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(['my-availabilities', playerEmail], context.previous);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-availabilities'] });
      toast.success('Availability added');
    },
  });

  const handleDateToggle = async (date, teeTime) => {
    const dateStr = format(date, 'yyyy-MM-dd');

    // Block any concurrent action on the same date
    if (pendingDates.has(dateStr)) return;

    const existing = myAvailabilities.filter(a => (a.date || '').split('T')[0] === dateStr);

    setPendingDates(prev => new Set(prev).add(dateStr));
    const clearPending = () => setPendingDates(prev => { const n = new Set(prev); n.delete(dateStr); return n; });

    if (existing.length > 0) {
      // Delete ALL records for this date (handles duplicates)
      const deletes = existing.map(a => deleteMutation.mutateAsync(a.id));
      Promise.allSettled(deletes).finally(clearPending);
    } else {
      // Auto-populate with tee time info
      if (teeTime) {
        createMutation.mutate(
          {
            date: dateStr,
            start_time: teeTime.start_time || null,
            end_time: teeTime.end_time || null,
            notes: teeTime.course ? `Course: ${teeTime.course}` : null,
          },
          { onSettled: clearPending }
        );
      } else {
        clearPending();
        setSelectedDate(date);
        setTimeDialogOpen(true);
      }
    }
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['my-availabilities'] });
    await queryClient.invalidateQueries({ queryKey: ['all-availabilities'] });
    await queryClient.invalidateQueries({ queryKey: ['tee-times'] });
  };

  const ptr = usePullToRefresh(handleRefresh);

  const handleTimeConfirm = (data) => {
    createMutation.mutate(data);
  };

  const closedDates = teeTimes
    .filter(t => t.notes?.includes('CLOSED'))
    .map(t => t.date);

  const handleMonthChange = (direction) => {
    setCurrentMonth(prev => {
      const newMonth = addMonths(prev, direction);
      return newMonth;
    });
    // Reset to month view when changing months
    setViewFilter('month');
    setSelectedViewDate(null);
  };

  const teeTimeDates = new Set(teeTimes.filter(t => !t.notes?.includes('CLOSED')).map(t => (t.date || '').split('T')[0]));
  const selectedDates = myAvailabilities.map(a => (a.date || '').split('T')[0]).filter(d => teeTimeDates.has(d));

  const formatTime = (time) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => {
      const availability = myAvailabilities.find(a => a.id === id);
      return api.entities.Availability.delete(id).then(res => ({ res, availability }));
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['my-availabilities', playerEmail] });
      const previous = queryClient.getQueryData(['my-availabilities', playerEmail]);
      queryClient.setQueryData(['my-availabilities', playerEmail], old =>
        (old || []).filter(a => a.id !== id)
      );
      return { previous };
    },
    onError: (error, id, context) => {
      // If 404, the record is already gone — force a fresh refetch instead of restoring stale data
      if (error?.message?.includes('404') || error?.status === 404) {
        queryClient.invalidateQueries({ queryKey: ['my-availabilities', playerEmail] });
      } else {
        queryClient.setQueryData(['my-availabilities', playerEmail], context.previous);
      }
    },
    onSuccess: ({ availability }) => {
      queryClient.invalidateQueries({ queryKey: ['my-availabilities'] });
      toast.success('Availability removed');
    },
  });

  // Filter tee times based on view mode
  let displayedTeeTimes = teeTimes.filter(t => !t.notes?.includes('CLOSED'))
    .sort((a, b) => {
      const aYes = myAvailabilities.some(av => (av.date || '').split('T')[0] === a.date);
      const bYes = myAvailabilities.some(av => (av.date || '').split('T')[0] === b.date);
      if (aYes && !bYes) return -1;
      if (!aYes && bYes) return 1;
      return new Date(a.date) - new Date(b.date);
    });
  
  if (viewFilter === 'date' && selectedViewDate) {
    // Show only the selected date
    const selectedDateStr = format(selectedViewDate, 'yyyy-MM-dd');
    displayedTeeTimes = displayedTeeTimes.filter(t => t.date === selectedDateStr);
  } else {
    // Show only tee times in the current month being viewed
    const monthStart = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), 'yyyy-MM-dd');
    const monthEnd = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0), 'yyyy-MM-dd');
    displayedTeeTimes = displayedTeeTimes.filter(t => t.date >= monthStart && t.date <= monthEnd);
  }
  
  // Get availabilities for each tee time date
  const availabilitiesByDate = allAvailabilities.reduce((acc, a) => {
    if (!acc[a.date]) acc[a.date] = [];
    acc[a.date].push(a);
    return acc;
  }, {});
  
  const isLoading = isLoadingMine || isLoadingAll;

  if (!playerName) {
    return (
      <div className="min-h-screen bg-linear-to-br from-emerald-50 via-white to-amber-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <PageTransition>
    <div
      ref={ptr.scrollRef}
      onTouchStart={ptr.onTouchStart}
      onTouchMove={ptr.onTouchMove}
      onTouchEnd={ptr.onTouchEnd}
      className="min-h-screen bg-linear-to-br from-emerald-50 via-white to-amber-50"
      style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <PullToRefreshIndicator pullDistance={ptr.pullDistance} refreshing={ptr.refreshing} threshold={ptr.THRESHOLD} />
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                League Calendar
              </h1>
              <p className="text-gray-500">
                Welcome, {playerName}
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <AvailabilityCalendar
              selectedDates={selectedDates}
              onDateToggle={handleDateToggle}
              currentMonth={currentMonth}
              onMonthChange={handleMonthChange}
              teeTimes={teeTimes}
              closedDates={closedDates}
            />
            <p className="text-xs text-gray-500 text-center mt-3">
              Click dates to toggle your availability
            </p>

            <TimeSelectionDialog
              open={timeDialogOpen}
              onOpenChange={setTimeDialogOpen}
              date={selectedDate}
              onConfirm={handleTimeConfirm}
            />

            </div>

          {/* Availability List */}
          <div className="lg:col-span-3 space-y-6">
            {/* View Filter Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {viewFilter === 'date' && selectedViewDate 
                  ? format(selectedViewDate, 'MMMM d, yyyy')
                  : 'Upcoming Availability'}
                <span className="text-sm font-normal text-gray-400">
                  ({displayedTeeTimes.length})
                </span>
              </h2>
              {viewFilter === 'date' && (
                <button
                  onClick={() => {
                    setViewFilter('month');
                    setSelectedViewDate(null);
                  }}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  View All
                </button>
              )}
            </div>

            {/* Availability Display */}
            <div>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                </div>
              ) : displayedTeeTimes.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
                  <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No {viewFilter === 'date' ? 'tee times for this date' : 'tee times this month'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedTeeTimes.map((teeTime) => {
                    const dateAvailabilities = availabilitiesByDate[teeTime.date] || [];
                    const myAvailability = dateAvailabilities.find(a => a.player_email === playerEmail);
                    return (
                      <div
                        key={teeTime.id}
                        onClick={() => handleDateToggle(parseISO(teeTime.date), teeTime)}
                        className={`bg-white rounded-xl border p-4 shadow-xs cursor-pointer transition-all hover:shadow-md ${myAvailability ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 hover:border-emerald-200'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {format(parseISO(teeTime.date), 'EEEE, MMMM d, yyyy')}
                            </h3>
                            {teeTime.start_time && (
                              <p className="text-sm text-gray-600 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                From {formatTime(teeTime.start_time)}
                              </p>
                            )}
                            {teeTime.course && teeTime.course !== 'TBD' && (
                              <p className="text-sm text-gray-500">
                                Course: {teeTime.course}{teeTime.notes && !teeTime.notes.includes('CLOSED') ? `, ${teeTime.notes}` : ''}
                              </p>
                            )}
                          </div>
                          <span className={`text-xs px-4 min-h-[44px] flex items-center rounded-full font-medium transition-colors select-none ${myAvailability ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'}`}>
                            {myAvailability ? "You're in ✓" : "Join"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>


          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}