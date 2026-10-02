'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DateFilter({ startDate, endDate, onStartChange, onEndChange, onClear }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">From:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal border-slate-200",
                !startDate && "text-slate-400"
              )}
            >
              <CalendarDays className="mr-2 h-4 w-4 text-emerald-600" />
              {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={onStartChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">To:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal border-slate-200",
                !endDate && "text-slate-400"
              )}
            >
              <CalendarDays className="mr-2 h-4 w-4 text-emerald-600" />
              {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={onEndChange}
              disabled={(date) => startDate && date < startDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {(startDate || endDate) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-slate-500 hover:text-slate-700"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}