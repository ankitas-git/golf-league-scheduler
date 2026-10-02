'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import useSettings from '@/hooks/useSettings';


function TeeTimeRow({ teeTime, onSave, onDelete }) {
  const { courses: COURSES, commissioners: COMMISSIONERS } = useSettings();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    start_time: teeTime.start_time || '',
    course: teeTime.course || COURSES[0],
    pairing: teeTime.pairing || '',
    notes: teeTime.notes || '',
    commissioner: teeTime.commissioner || '',
  });

  const handleSave = () => {
    onSave(teeTime.id, form);
    setEditing(false);
  };

  const dateLabel = format(parseISO(teeTime.date), 'EEE, MMM d');

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="w-28 text-sm font-medium text-slate-700 shrink-0">{dateLabel}</div>

      {editing ? (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            type="time"
            value={form.start_time}
            onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
            className="w-32 h-8 text-sm"
          />
          <select
            value={form.course}
            onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
            className="h-8 text-sm border border-slate-200 rounded-md px-2"
          >
            {COURSES.map(c => <option key={c}>{c}</option>)}
          </select>

          <select
            value={form.commissioner}
            onChange={e => setForm(f => ({ ...f, commissioner: e.target.value }))}
            className="h-8 text-sm border border-slate-200 rounded-md px-2"
          >
            <option value="">— Commissioner —</option>
            {COMMISSIONERS.map(c => <option key={c}>{c}</option>)}
          </select>
          <Input
            placeholder="Notes"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-40 h-8 text-sm"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={handleSave}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-slate-800 w-16">
            {teeTime.start_time
              ? (() => {
                  const [h, m] = teeTime.start_time.split(':').map(Number);
                  const ampm = h >= 12 ? 'PM' : 'AM';
                  const hour = h % 12 || 12;
                  return `${hour}:${String(m).padStart(2,'0')} ${ampm}`;
                })()
              : '—'}
          </span>
          <Badge variant="outline" className="text-xs">{teeTime.course || '—'}</Badge>
          {teeTime.commissioner && (
            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">{teeTime.commissioner}</Badge>
          )}
          {teeTime.notes && <span className="text-xs text-amber-600">{teeTime.notes}</span>}
          <div className="ml-auto flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => onDelete(teeTime.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddTeeTimeForm({ onAdd, onCancel }) {
  const { courses: COURSES, commissioners: COMMISSIONERS } = useSettings();
  const [form, setForm] = useState({ date: '', start_time: '', course: COURSES[0], pairing: '', notes: '', commissioner: '' });

  return (
    <div className="flex flex-wrap items-center gap-2 py-3 border-t border-emerald-100 bg-emerald-50/50 px-2 rounded-lg mt-2">
      <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-36 h-8 text-sm" />
      <Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-32 h-8 text-sm" />
      <select value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))} className="h-8 text-sm border border-slate-200 rounded-md px-2">
        {COURSES.map(c => <option key={c}>{c}</option>)}
      </select>
      <select value={form.commissioner} onChange={e => setForm(f => ({ ...f, commissioner: e.target.value }))} className="h-8 text-sm border border-slate-200 rounded-md px-2">
        <option value="">— Commissioner —</option>
        {COMMISSIONERS.map(c => <option key={c}>{c}</option>)}
      </select>
      <Input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-40 h-8 text-sm" />
      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => form.date && onAdd(form)} disabled={!form.date}>
        Add
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

export default function TeeTimeEditor() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: teeTimes = [], isLoading } = useQuery({
    queryKey: ['tee-times'],
    queryFn: () => api.entities.TeeTime.list('date'),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.TeeTime.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tee-times'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.TeeTime.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tee-times'] }),
  });

  const addMutation = useMutation({
    mutationFn: (data) => api.entities.TeeTime.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tee-times'] });
      setShowAdd(false);
    },
  });

  // Group by month
  const grouped = teeTimes.reduce((acc, t) => {
    const month = t.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(t);
    return acc;
  }, {});

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-emerald-600" />
            Tee Time Manager
          </CardTitle>
          <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Tee Time
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAdd && <AddTeeTimeForm onAdd={(data) => addMutation.mutate(data)} onCancel={() => setShowAdd(false)} />}
        {isLoading ? (
          <div className="text-sm text-slate-400 py-4 text-center">Loading...</div>
        ) : (
          Object.keys(grouped).sort().map(month => (
            <div key={month} className="mb-6">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {format(parseISO(month + '-01'), 'MMMM yyyy')}
              </div>
              {grouped[month].map(tt => (
                <TeeTimeRow
                  key={tt.id}
                  teeTime={tt}
                  onSave={(id, data) => saveMutation.mutate({ id, data })}
                  onDelete={(id) => deleteMutation.mutate(id)}
                />
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}