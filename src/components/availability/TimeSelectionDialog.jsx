'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function TimeSelectionDialog({ open, onOpenChange, date, onConfirm }) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const handleConfirm = () => {
    onConfirm({
      date: format(date, 'yyyy-MM-dd'),
      start_time: startTime || null,
      end_time: endTime || null,
    });
    setStartTime('');
    setEndTime('');
    onOpenChange(false);
  };

  const handleSkip = () => {
    onConfirm({
      date: format(date, 'yyyy-MM-dd'),
      start_time: null,
      end_time: null,
    });
    setStartTime('');
    setEndTime('');
    onOpenChange(false);
  };

  if (!date) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Set Preferred Time
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-gray-600 mb-4">
            Adding availability for <span className="font-semibold text-gray-900">{format(date, 'EEEE, MMMM d, yyyy')}</span>
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Start Time (optional)</Label>
              <Input
                id="start_time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">End Time (optional)</Label>
              <Input
                id="end_time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSkip}>
            Skip (Any Time)
          </Button>
          <Button onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-700">
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}