'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { SETTINGS, serializeSetting } from '@/lib/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const toForm = (values) =>
  Object.fromEntries(SETTINGS.map((def) => [def.key, serializeSetting(def, values?.[def.key] ?? def.default)]));

export default function SettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  // Keyed on the saved values, so the form resets to them after a load or save.
  const [form, setForm] = useState(() => toForm(data));
  const [seen, setSeen] = useState(data);
  if (data !== seen) {
    setSeen(data);
    setForm(toForm(data));
  }

  const save = useMutation({
    mutationFn: (changes) => api.settings.save(changes),
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      toast.success('Settings saved');
    },
    onError: (err) => toast.error(err.message),
  });

  const saved = toForm(data);
  const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== saved[k]));
  const dirty = Object.keys(changes).length > 0;

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-5 w-5 text-emerald-600" />
          League Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty) save.mutate(changes);
            }}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              {SETTINGS.map((def) => {
                const id = `setting-${def.key}`;
                const value = form[def.key] ?? '';
                const onChange = (v) => setForm((f) => ({ ...f, [def.key]: v }));
                return (
                  <div key={def.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={id}>{def.label}</Label>
                      {value !== serializeSetting(def, def.default) && (
                        <button
                          type="button"
                          onClick={() => onChange(serializeSetting(def, def.default))}
                          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                          title="Reset to default"
                        >
                          <RotateCcw className="w-3 h-3" /> Default
                        </button>
                      )}
                    </div>
                    {def.type === 'choice' ? (
                      <select
                        id={id}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="h-9 w-full text-base sm:text-sm border border-slate-200 rounded-md px-2 bg-white"
                      >
                        {def.options.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <Input
                        id={id}
                        type={def.type === 'int' ? 'number' : def.type === 'url' ? 'url' : 'text'}
                        min={def.min}
                        max={def.max}
                        value={value}
                        placeholder={def.type === 'url' ? 'https://docs.google.com/spreadsheets/d/...' : undefined}
                        onChange={(e) => onChange(e.target.value)}
                        aria-describedby={def.help ? `${id}-help` : undefined}
                      />
                    )}
                    {def.help && <p id={`${id}-help`} className="text-xs text-slate-500">{def.help}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!dirty || save.isPending} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Settings
              </Button>
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => setForm(saved)}>Discard</Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
