'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AccountDialog({ user, children }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const changes = { email };
      if (next) Object.assign(changes, { current_password: current, new_password: next });
      await api.auth.updateMe(changes);
      toast.success(next ? 'Password changed. Other devices were signed out.' : 'Account saved');
      setCurrent('');
      setNext('');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(''); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user.player_name}</DialogTitle>
          <DialogDescription>Signed in as @{user.username}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="account-email">Email (optional)</Label>
            <Input id="account-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-gray-500">Used only to send you pairings and availability changes.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Change password</legend>
            <Input aria-label="Current password" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input aria-label="New password" type="password" autoComplete="new-password" placeholder="New password, 8 or more characters" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </fieldset>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
