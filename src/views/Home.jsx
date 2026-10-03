'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/api/client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageTransition from '@/components/PageTransition';

function ErrorText({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 text-sm text-red-600">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// The session cookie is set by now, so the server renders the calendar for this user.
function useGoToCalendar() {
  const router = useRouter();
  return () => router.replace(createPageUrl('PlayerDashboard'));
}

function LoginForm() {
  const goToCalendar = useGoToCalendar();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.auth.login(username, password);
      goToCalendar();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="login-username">Username</Label>
        <Input id="login-username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 text-lg" autoFocus required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="login-password">Password</Label>
        <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-lg" required />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy || !username || !password} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-lg font-medium">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Log In <ArrowRight className="w-5 h-5 ml-2" /></>}
      </Button>
      <p className="text-center text-sm text-gray-500">Forgot your password? Ask a league admin to reset it.</p>
    </form>
  );
}

// Step one checks the league code and finds the golfer by last name. Step two creates the login.
function SignupForm({ codeRequired }) {
  const goToCalendar = useGoToCalendar();
  const [lastName, setLastName] = useState('');
  const [matches, setMatches] = useState(null);
  const [code, setCode] = useState('');
  const [player, setPlayer] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', confirm: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const lookUp = async (e) => {
    e.preventDefault();
    setError('');
    if (lastName.trim().length < 2) {
      setError('Please enter your complete last name (not just an initial)');
      return;
    }
    setBusy(true);
    try {
      const res = await api.auth.rosterMatches(lastName.trim(), code.trim() || undefined);
      if (res.matches.length === 0) {
        setError('That last name is not on the league roster. Please contact a league admin.');
      } else if (res.matches.length === 1) {
        choose(res.matches[0]);
      } else {
        setMatches(res.matches);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const choose = (m) => {
    if (m.registered) {
      setError(`${m.name} already has an account. Log in instead, or ask an admin to reset it.`);
      return;
    }
    setError('');
    setPlayer(m.name);
    setForm((f) => ({ ...f, username: f.username || m.name.split(/\s+/).pop().replace(/\(.*\)/, '').toLowerCase() }));
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('The passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.auth.signup({
        player_name: player,
        username: form.username,
        password: form.password,
        email: form.email,
        signup_code: code.trim() || undefined,
      });
      goToCalendar();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (player) {
    return (
      <form onSubmit={create} className="space-y-4">
        <p className="text-sm text-gray-600">
          Creating a login for <span className="font-semibold text-gray-900">{player}</span>.
        </p>
        <div className="space-y-1">
          <Label htmlFor="signup-username">Username</Label>
          <Input id="signup-username" autoComplete="username" autoCapitalize="none" value={form.username} onChange={set('username')} required minLength={3} maxLength={32} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="signup-password">Password</Label>
          <Input id="signup-password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={8} aria-describedby="signup-password-help" />
          <p id="signup-password-help" className="text-xs text-gray-500">8 or more characters.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="signup-confirm">Confirm password</Label>
          <Input id="signup-confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="signup-email">Email (optional)</Label>
          <Input id="signup-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-describedby="signup-email-help" />
          <p id="signup-email-help" className="text-xs text-gray-500">Only used to send you pairings.</p>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-lg font-medium">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={() => { setPlayer(null); setMatches(null); setError(''); }}>
          Back
        </Button>
      </form>
    );
  }

  if (matches) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg">More than one golfer has that last name. Please pick yours.</p>
        <div className="space-y-2">
          {matches.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => choose(m)}
              className="w-full p-4 text-left bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 rounded-lg transition-all"
            >
              <span className="font-medium text-gray-900">{m.name}</span>
              {m.registered && <span className="ml-2 text-xs text-gray-500">(already signed up)</span>}
            </button>
          ))}
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="button" variant="outline" className="w-full" onClick={() => { setMatches(null); setError(''); }}>Back</Button>
      </div>
    );
  }

  return (
    <form onSubmit={lookUp} className="space-y-4">
      {codeRequired && (
        <div className="space-y-1">
          <Label htmlFor="signup-code">League signup code</Label>
          <Input id="signup-code" autoComplete="off" autoCapitalize="none" value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} className="h-12 text-lg" autoFocus required aria-describedby="signup-code-help" />
          <p id="signup-code-help" className="text-xs text-gray-500">Ask a league admin if you do not have it.</p>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="signup-last">Your last name</Label>
        <Input id="signup-last" placeholder="As it appears on the league roster" value={lastName} onChange={(e) => { setLastName(e.target.value); setError(''); }} className="h-12 text-lg" autoFocus={!codeRequired} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy || !lastName.trim() || (codeRequired && !code.trim())} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-lg font-medium">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-5 h-5 ml-2" /></>}
      </Button>
    </form>
  );
}

export default function Home({ leagueName, codeRequired }) {
  const [mode, setMode] = useState('login');

  return (
    <PageTransition>
      <main className="min-h-screen bg-linear-to-br from-emerald-50 via-white to-amber-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="text-center mb-6">
              <Image src="/oh-shield.png" alt="Oakland Hills shield" width={64} height={64} priority className="w-16 h-16 object-contain mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{leagueName} Scheduler</h1>
              <p className="text-gray-500">Log in to view tee times and mark your availability</p>
            </div>

            <div role="tablist" aria-label="Log in or sign up" className="grid grid-cols-2 gap-1 p-1 mb-6 bg-gray-100 rounded-lg">
              {[['login', 'Log In'], ['signup', 'First Time? Sign Up']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => setMode(key)}
                  className={`py-2 text-sm font-medium rounded-md transition-colors ${mode === key ? 'bg-white shadow-sm text-emerald-700' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'login' ? <LoginForm /> : <SignupForm codeRequired={codeRequired} />}
          </div>

          <p className="text-center text-sm text-gray-400 mt-6">Only golfers on the league roster can sign in</p>
        </div>
      </main>
    </PageTransition>
  );
}
