'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Download, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const name = (p) => `${p.first_name} ${p.last_name}`;

function Check({ checked, onChange, label, children }) {
  return (
    <label className="flex items-center gap-3 py-2 min-h-11 cursor-pointer">
      <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="text-sm text-slate-700">{children}</span>
    </label>
  );
}

// Nothing applies until the admin ticks rows and confirms. The sheet is world editable.
function ImportReview({ preview, onDone }) {
  const queryClient = useQueryClient();
  const [add, setAdd] = useState(() => new Set(preview.add.map((p) => p.name_key)));
  const [remove, setRemove] = useState(() => new Set());
  const [updateHandicaps, setUpdateHandicaps] = useState(preview.handicaps.length > 0);
  const toggle = (set, setter, key, on) => {
    const next = new Set(set);
    if (on) next.add(key); else next.delete(key);
    setter(next);
  };

  const apply = useMutation({
    mutationFn: () => api.admin.applyRosterImport({ add: [...add], remove: [...remove], updateHandicaps }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['roster'] });
      toast.success(`Added ${r.added}, removed ${r.removed}, updated ${r.handicaps_updated} handicaps`);
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const nothing = preview.add.length === 0 && preview.remove.length === 0 && preview.handicaps.length === 0;
  if (nothing) {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
        The roster already matches the sheet ({preview.sheet_count} golfers).
        <Button variant="ghost" size="sm" className="ml-2" onClick={onDone}>Close</Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-4">
      <p className="text-sm text-amber-900">
        Review before applying. Anyone with the link can edit the sheet, so only approve names you recognize.
      </p>

      {preview.add.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">On the sheet, not the roster ({preview.add.length})</h3>
          {preview.add.map((p) => (
            <Check key={p.name_key} checked={add.has(p.name_key)} onChange={(on) => toggle(add, setAdd, p.name_key, on)} label={`Add ${name(p)}`}>
              Add <span className="font-medium">{name(p)}</span>
            </Check>
          ))}
        </section>
      )}

      {preview.remove.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">On the roster, not the sheet ({preview.remove.length})</h3>
          <p className="text-xs text-slate-500">Unchecked by default. Removing a golfer locks their account out.</p>
          {preview.remove.map((p) => (
            <Check key={p.name_key} checked={remove.has(p.name_key)} onChange={(on) => toggle(remove, setRemove, p.name_key, on)} label={`Remove ${name(p)}`}>
              Remove <span className="font-medium">{name(p)}</span>
              {p.has_account && <span className="ml-2 text-xs text-red-600">has an account</span>}
            </Check>
          ))}
        </section>
      )}

      {preview.handicaps.length > 0 && (
        <section>
          <Check checked={updateHandicaps} onChange={setUpdateHandicaps} label="Update handicaps">
            Update {preview.handicaps.length} handicap{preview.handicaps.length === 1 ? '' : 's'}
          </Check>
          <ul className="pl-8 text-xs text-slate-500 space-y-0.5 max-h-40 overflow-y-auto">
            {preview.handicaps.map((p) => (
              <li key={p.name_key}>{name(p)}: {p.old_hi_index ?? 'none'} to {p.hi_index ?? 'none'}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => apply.mutate()} disabled={apply.isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
          {apply.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Apply Selected
        </Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export default function RosterPanel() {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [filter, setFilter] = useState('');
  const { data: roster = [], isLoading } = useQuery({ queryKey: ['roster'], queryFn: api.admin.roster });

  const check = useMutation({
    mutationFn: api.admin.previewRosterImport,
    onSuccess: setPreview,
    onError: (err) => toast.error(err.message),
  });
  const add = useMutation({
    mutationFn: () => api.admin.addToRoster(first, last),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roster'] });
      toast.success(`Added ${first} ${last}`);
      setFirst('');
      setLast('');
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => api.admin.removeFromRoster(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }),
    onError: (err) => toast.error(err.message),
  });

  const shown = roster.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-emerald-600" />
          League Roster
          <span className="text-sm font-normal text-slate-400">({roster.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-slate-500">
          Only golfers on this list can sign up or log in. Edits to the handicap sheet do nothing until you import and approve them here.
        </p>

        {preview ? (
          <ImportReview preview={preview} onDone={() => setPreview(null)} />
        ) : (
          <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending} className="border-emerald-600 text-emerald-700">
            {check.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Check Sheet for Changes
          </Button>
        )}

        <form
          className="flex flex-wrap gap-2 items-end"
          onSubmit={(e) => { e.preventDefault(); if (first.trim() && last.trim()) add.mutate(); }}
        >
          <Input aria-label="First name" placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} className="w-36 flex-1 sm:flex-none" />
          <Input aria-label="Last name" placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} className="w-36 flex-1 sm:flex-none" />
          <Button type="submit" disabled={add.isPending || !first.trim() || !last.trim()} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            <Plus className="w-4 h-4 mr-1" /> Add Golfer
          </Button>
        </form>

        <Input aria-label="Search the roster" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />

        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-900 truncate">
                    <span className="font-medium">{p.last_name}</span>, {p.first_name}
                  </span>
                  {p.has_account && <Badge variant="outline" className="text-xs">signed up</Badge>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{p.hi_index ?? 'no H.I.'}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 sm:h-8 sm:w-8 text-slate-400 hover:text-red-600"
                    title={`Remove ${p.name}`}
                    aria-label={`Remove ${p.name} from the roster`}
                    disabled={remove.isPending}
                    onClick={() => {
                      const warn = p.has_account ? ' Their account will be locked out.' : '';
                      if (window.confirm(`Remove ${p.name} from the roster?${warn}`)) remove.mutate(p.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
