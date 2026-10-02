'use client';

import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, X, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function ManagerCalendar({ teeTimes, availabilities, onDeleteTeeTime }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Get unique courses
  const courses = [...new Set(teeTimes.map(t => t.course).filter(Boolean))];

  // Filter tee times by course
  const filteredTeeTimes = selectedCourse === 'all' 
    ? teeTimes 
    : teeTimes.filter(t => t.course === selectedCourse);

  // Get calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get tee times for a specific date
  const getTeeTimesForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return filteredTeeTimes.filter(t => t.date === dateStr);
  };

  // Get availability count for a date
  const getAvailabilityCount = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const uniquePlayers = new Set(
      availabilities
        .filter(a => a.date === dateStr)
        .map(a => a.player_email)
    );
    return uniquePlayers.size;
  };

  // Handle date click
  const handleDateClick = (date) => {
    const dateTeeTimes = getTeeTimesForDate(date);
    if (dateTeeTimes.length > 0) {
      setSelectedDate(date);
      setDetailsDialogOpen(true);
    }
  };

  const selectedDateTeeTimes = selectedDate ? getTeeTimesForDate(selectedDate) : [];
  const selectedDateAvailabilities = selectedDate 
    ? availabilities.filter(a => a.date === format(selectedDate, 'yyyy-MM-dd'))
    : [];

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-slate-900 min-w-[150px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map(course => (
              <SelectItem key={course} value={course}>{course}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar Grid */}
      <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
        <CardContent className="p-0">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-3 text-center text-sm font-semibold text-slate-600">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const dayTeeTimes = getTeeTimesForDate(day);
              const availabilityCount = getAvailabilityCount(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              const hasClosed = dayTeeTimes.some(t => t.notes?.includes('CLOSED'));

              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[120px] border-b border-r border-slate-100 p-2 transition-colors",
                    !isCurrentMonth && "bg-slate-50/50",
                    isCurrentMonth && "hover:bg-emerald-50/30 cursor-pointer",
                    dayTeeTimes.length > 0 && isCurrentMonth && "bg-white"
                  )}
                  onClick={() => isCurrentMonth && handleDateClick(day)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={cn(
                      "text-sm font-medium",
                      !isCurrentMonth && "text-slate-400",
                      isCurrentMonth && "text-slate-700",
                      isToday && "bg-emerald-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                    )}>
                      {format(day, 'd')}
                    </span>
                    {availabilityCount > 0 && isCurrentMonth && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-emerald-50 text-emerald-700 border-emerald-200">
                        <Users className="w-3 h-3 mr-1" />
                        {availabilityCount}
                      </Badge>
                    )}
                  </div>

                  {/* Tee Times Preview */}
                  <div className="space-y-1">
                    {hasClosed ? (
                      <div className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded font-medium">
                        CLOSED
                      </div>
                    ) : (
                      dayTeeTimes.slice(0, 2).map((teeTime, i) => (
                        <div
                          key={i}
                          className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded truncate"
                        >
                          <Clock className="w-3 h-3 inline mr-1" />
                          {teeTime.start_time || 'TBD'}
                        </div>
                      ))
                    )}
                    {dayTeeTimes.length > 2 && (
                      <div className="text-xs text-slate-500 px-2">
                        +{dayTeeTimes.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </DialogTitle>
            <DialogDescription>
              {selectedDateTeeTimes.length} tee time{selectedDateTeeTimes.length !== 1 ? 's' : ''} • {selectedDateAvailabilities.length} player{selectedDateAvailabilities.length !== 1 ? 's' : ''} available
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Tee Times */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Tee Times</h3>
              <div className="space-y-2">
                {selectedDateTeeTimes.map(teeTime => {
                  const dateStr = format(selectedDate, 'yyyy-MM-dd');
                  const pairingAvailable = availabilities.some(
                    a => a.date === dateStr && teeTime.pairing && 
                    a.player_name?.toLowerCase().includes(teeTime.pairing.toLowerCase())
                  );

                  return (
                    <Card key={teeTime.id} className="border border-slate-200">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              {teeTime.start_time && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {teeTime.start_time}
                                  {teeTime.end_time && ` - ${teeTime.end_time}`}
                                </Badge>
                              )}
                              {teeTime.course && (
                                <Badge variant="outline" className="border-slate-300">
                                  <MapPin className="w-3 h-3 mr-1" />
                                  {teeTime.course}
                                </Badge>
                              )}
                              {teeTime.pairing && (
                                <Badge variant="outline" className={cn(
                                  pairingAvailable ? "border-green-300 bg-green-50 text-green-700" : "border-slate-300"
                                )}>
                                  {pairingAvailable ? <Check className="w-3 h-3 mr-1" /> : null}
                                  {teeTime.pairing}
                                </Badge>
                              )}
                            </div>
                            {teeTime.notes && !teeTime.notes.includes('CLOSED') && (
                              <p className="text-sm text-slate-600">{teeTime.notes}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm('Delete this tee time?')) {
                                onDeleteTeeTime(teeTime.id);
                              }
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Available Players */}
            {selectedDateAvailabilities.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Available Players</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedDateAvailabilities.map(avail => (
                    <Badge key={avail.id} variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                      <Check className="w-3 h-3 mr-1" />
                      {avail.player_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}