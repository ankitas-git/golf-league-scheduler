'use client';

import React from 'react';
import { format, parseISO } from "date-fns";
import { Calendar, Clock, Trash2, User, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function AvailabilityCard({ availability, onDelete, showPlayer = false, canDelete = true }) {
  const formatTime = (time) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const hasTimeRange = availability.start_time || availability.end_time;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-emerald-200 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {format(parseISO(availability.date), "EEEE, MMM d")}
              </p>
              <p className="text-xs text-gray-500">
                {format(parseISO(availability.date), "yyyy")}
              </p>
            </div>
          </div>

          {showPlayer && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium">{availability.player_name}</span>
            </div>
          )}

          {hasTimeRange && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {availability.start_time && formatTime(availability.start_time)}
                {availability.start_time && availability.end_time && ' – '}
                {availability.end_time && formatTime(availability.end_time)}
                {!availability.start_time && availability.end_time && `Until ${formatTime(availability.end_time)}`}
                {availability.start_time && !availability.end_time && `From ${formatTime(availability.start_time)}`}
              </span>
            </div>
          )}

          {availability.notes && (
            <div className="flex items-start gap-2 text-sm text-gray-500">
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-gray-400" />
              <span className="italic">{availability.notes}</span>
            </div>
          )}
        </div>

        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(availability.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}