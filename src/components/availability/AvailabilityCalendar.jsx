'use client';

import React, { useState, useRef, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay, addWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, Calendar, CalendarDays, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AvailabilityCalendar({ selectedDates = [], onDateToggle, currentMonth, onMonthChange, teeTimes = [], closedDates = [] }) {
  const [viewMode, setViewMode] = useState('month'); // 'month' or 'week'
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date()));
  const [activePopoverDay, setActivePopoverDay] = useState(null);
  const popoverRef = useRef(null);
  const pressTimerRef = useRef(null);

  // Close popover on outside tap
  useEffect(() => {
    if (activePopoverDay === null) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setActivePopoverDay(null);
      }
    };
    document.addEventListener('touchstart', handler);
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [activePopoverDay]);

  // Month view calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = monthStart.getDay();
  const paddingDays = Array(startDay).fill(null);

  // Week view calculations
  const weekEnd = endOfWeek(currentWeekStart);
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  const days = viewMode === 'month' ? monthDays : weekDays;

  const handleWeekChange = (direction) => {
    setCurrentWeekStart(prev => addWeeks(prev, direction));
  };
  
  const isDateSelected = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return selectedDates.includes(dateStr);
  };

  const getTeeTimeForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return teeTimes.find(t => (t.date || '').split('T')[0] === dateStr);
  };

  const isAvailableDate = (date) => {
    const teeTime = getTeeTimeForDate(date);
    return teeTime && !teeTime.notes?.includes('CLOSED');
  };

  const isClosedDate = (date) => {
    const teeTime = getTeeTimeForDate(date);
    return teeTime?.notes?.includes('CLOSED') || closedDates.includes(format(date, 'yyyy-MM-dd'));
  };

  const formatTime = (time) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleDateClick = (date) => {
    if (isClosedDate(date)) return;
    // Allow clicking both available dates and selected dates
    if (!isAvailableDate(date) && !isDateSelected(date)) return;
    onDateToggle(date, getTeeTimeForDate(date));
  };

  // Long-press / tap handler for popover
  const handleDayInteraction = (day, teeTime) => {
    if (!teeTime) return;
    const dayKey = day.toISOString();
    setActivePopoverDay(prev => prev === dayKey ? null : dayKey);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {viewMode === 'month' 
            ? format(currentMonth, 'MMMM yyyy')
            : `${format(currentWeekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
          }
        </h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => viewMode === 'month' ? onMonthChange(-1) : handleWeekChange(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => viewMode === 'month' ? onMonthChange(1) : handleWeekChange(1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
        <button
          onClick={() => setViewMode('month')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all",
            viewMode === 'month' 
              ? "bg-white text-gray-900 shadow-sm" 
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <Calendar className="w-4 h-4" />
          Month
        </button>
        <button
          onClick={() => setViewMode('week')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all",
            viewMode === 'week' 
              ? "bg-white text-gray-900 shadow-sm" 
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <CalendarDays className="w-4 h-4" />
          Week
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-400 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn(
        "grid gap-1",
        viewMode === 'month' ? "grid-cols-7" : "grid-cols-7"
      )}>
        {viewMode === 'month' && paddingDays.map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square" />
        ))}
        
        {days.map(day => {
          const teeTime = getTeeTimeForDate(day);
          const available = isAvailableDate(day);
          const selected = isDateSelected(day);
          const closed = isClosedDate(day);
          const todayDate = isToday(day);
          const dayKey = day.toISOString();
          const isPopoverOpen = activePopoverDay === dayKey;
          
          return (
            <div key={dayKey} className="relative">
              <button
                onClick={() => {
                  if (closed) return;
                  // On desktop: click toggles availability directly.
                  // On mobile: if there's a tee time, open popover on tap.
                  const isTouch = 'ontouchstart' in window;
                  if (isTouch && teeTime && !closed) {
                    handleDayInteraction(day, teeTime);
                  } else {
                    handleDateClick(day);
                  }
                }}
                disabled={(!available && !selected) || closed}
                className={cn(
                  "w-full rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all relative",
                  viewMode === 'month' ? "aspect-square" : "py-4",
                  // No tee time - greyed out
                  !teeTime && "text-gray-300 cursor-not-allowed bg-gray-50",
                  // Closed - red/unavailable
                  closed && "text-red-400 cursor-not-allowed bg-red-50 ring-1 ring-red-200",
                  // Has tee time, not selected - green outline
                  available && !selected && !closed && "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200",
                  // Player selected - solid green
                  selected && "bg-emerald-600 text-white hover:bg-emerald-700 ring-0",
                  // Today indicator
                  todayDate && !selected && available && !closed && "ring-2 ring-emerald-400",
                  // Popover open highlight
                  isPopoverOpen && "ring-2 ring-emerald-500"
                )}
              >
                {viewMode === 'week' && (
                  <span className={cn("text-xs mb-1", selected ? "text-emerald-100" : "text-gray-400")}>{format(day, 'EEE')}</span>
                )}
                <span>{format(day, 'd')}</span>
                {selected && (
                  <Check className="w-3 h-3 absolute bottom-1 right-1" />
                )}
                {closed && (
                  <span className="text-[10px] absolute bottom-0.5">Closed</span>
                )}
              </button>

              {/* Touch-friendly popover for tee time details */}
              {teeTime && !closed && isPopoverOpen && (
                <div
                  ref={popoverRef}
                  className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-900 text-sm">{format(day, 'EEEE, MMM d, yyyy')}</p>
                    {teeTime.start_time && (
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        From {formatTime(teeTime.start_time)}
                      </p>
                    )}
                    {teeTime.course && (
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Course: {teeTime.course}
                      </p>
                    )}
                  </div>
                  {!closed && (
                    <button
                      onClick={() => {
                        setActivePopoverDay(null);
                        handleDateClick(day);
                      }}
                      className="mt-2 w-full text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg py-1.5 select-none"
                    >
                      {selected ? 'Remove availability' : 'Mark available'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-gray-100 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3.5 h-3.5 rounded bg-emerald-50 ring-1 ring-emerald-200" />
          <span>Tee Time</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3.5 h-3.5 rounded bg-emerald-600" />
          <span>I'm In</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3.5 h-3.5 rounded bg-red-50 ring-1 ring-red-200" />
          <span>Closed</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3.5 h-3.5 rounded bg-gray-100" />
          <span>No Tee Time</span>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-2">
        Tap dates for tee time details
      </p>
    </div>
  );
}