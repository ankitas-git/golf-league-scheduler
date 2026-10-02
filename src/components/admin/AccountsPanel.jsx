'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { KeyRound, Loader2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Readable temporary passwords to hand a golfer over the phone.
function tempPassword() {
  const words = ['birdie', 'eagle', 'fairway', 'bunker', 'putter', 'driver', 'wedge', 'divot', 'green', 'mulligan'];
  const bytes = crypto.getRandomValues(new Uint32Array(3));
  return `${words[bytes[0] % words.length]}-${words[bytes[1] % words.length]}-${1000 + (bytes[2] % 9000)}`;
}

function ResetRow({ account, onDone }) {
  const [password, setPassword] = useState(tempPassword);
  const reset = useMutation({
    mutationFn: () => api.admin.resetPassword(account.id, password),
    onSuccess: () => {
      toast.success(`Password reset for ${account.player_name}`);
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <Input
        aria-label={`New password for ${account.player_name}`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-8 text-sm w-56"
      />
      <Button size="sm" className="h-8" disabled={reset.isPending || password.length < 8} onClick={() => reset.mutate()}>
        {reset.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Password'}
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onDone}>Cancel</Button>
      <p className="w-full text-xs text-slate-500">Give this to the golfer. They can change it from their account menu.</p>
    </div>
  );
}

export default function AccountsPanel() {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(null);
  const { data: accounts = [], isLoading } = useQuery({ queryKey: ['accounts'], queryFn: api.admin.accounts });

  const remove = useMutation({
    mutationFn: (id) => api.admin.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Account removed');
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-emerald-600" />
          Player Accounts
          <span className="text-sm font-normal text-slate-400">({accounts.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500 mb-4">
          Golfers sign up themselves. Only names on the handicap sheet can sign up or log in. Admins are set in the deployment config.
        </p>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-400">No one has signed up yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{a.player_name}</span>
                    <span className="text-sm text-slate-400">@{a.username}</span>
                    {a.role === 'admin' && <Badge className="bg-emerald-100 text-emerald-700 border-0">Admin</Badge>}
                    {a.email && <span className="text-xs text-slate-400 hidden sm:inline">{a.email}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 mr-2">Joined {format(parseISO(a.created_date), 'M/d/yy')}</span>
                    <Button size="sm" variant="ghost" className="h-10 w-10 sm:h-8 sm:w-auto" onClick={() => setResetting(a.id)} title="Reset password">
                      <KeyRound className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 w-10 sm:h-8 sm:w-auto text-slate-400 hover:text-red-600"
                      title="Remove account"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove the account for ${a.player_name}? Their availability stays. They can sign up again.`)) remove.mutate(a.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {resetting === a.id && <ResetRow account={a} onDone={() => setResetting(null)} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
