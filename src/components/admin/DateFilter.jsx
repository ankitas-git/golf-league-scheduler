'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DateFilter({ startDate, endDate, onStartDateChange, onEndDateChange, onClear }) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const hasFilters = startDate || endDate;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Filter className="w-4 h-4" />
        <span className="font-medium">Filter by date:</span>
      </div>
      
      <div className="flex items-center gap-2">
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 px-3 text-sm border-gray-200 hover:border-emerald-300",
                !startDate && "text-gray-400"
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {startDate ? format(startDate, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(d) => {
                onStartDateChange(d);
                setStartOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <span className="text-gray-400">–</span>

        <Popover open={endOpen} onOpenChange={setEndOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 px-3 text-sm border-gray-200 hover:border-emerald-300",
                !endDate && "text-gray-400"
              )}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {endDate ? format(endDate, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(d) => {
                onEndDateChange(d);
                setEndOpen(false);
              }}
              disabled={(date) => startDate && date < startDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-9 px-2 text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}