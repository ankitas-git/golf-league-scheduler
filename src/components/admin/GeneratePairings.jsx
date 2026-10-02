'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, FileSpreadsheet, CheckCircle2, Mail } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import useSettings from '@/hooks/useSettings';

export default function GeneratePairings({ teeTimes }) {
  const [selectedDate, setSelectedDate] = useState('');
  const settings = useSettings();
  const [tee, setTee] = useState(settings.default_tee);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [populating, setPopulating] = useState(false);
  const [populated, setPopulated] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [game, setGame] = useState('');
  const [pairingsSheetUrl, setPairingsSheetUrl] = useState('');

  useEffect(() => {
    api.entities.AppSettings.filter({ setting_key: 'pairings_sheet_url' }).then(records => {
      if (records.length > 0) setPairingsSheetUrl(records[0].setting_value);
    }).catch(() => {});
  }, []);

  const GAME_OPTIONS = [
    { label: '20/20 — Foursomes / 15/15 — Threesomes', text: 'Game: Foursomes: 20/20, 0 to 4 balls must be chosen per hole. Threesomes: 15/15, 0 to 3 balls must be chosen per hole and multiply score by 4/3' },
    { label: '20/20 w/Stableford pts', text: 'Game: 20/20 w/Stableford pts, each foursome chooses 20 balls per 9 holes, 0 to 4 balls must be chosen per hole. The choice must be made before the next tee shot then not changed. Threesomes choose 15 balls per 9 holes, 0 to 3 balls chosen per hole, same rules apply, multiply by 4/3' },
    { label: '1,2,3', text: 'Game: 1,2,3. Use 1 ball on par 5\'s, 2 on par 4\'s and 3 on par 3\'s' },
    { label: '2 Best Balls of Foursome', text: 'Game: 2 best balls of foursome' },
    { label: '2 Best Balls except holes z & x', text: 'Game: 2 best balls of foursome except for holes z and x. On z count 3 balls. On x count 4 balls.' },
    { label: '2 Best Balls +', text: 'Game: 2 best balls "+" ("+" means counting all balls that are net par or better)' },
    // Scramble teams are the whole foursome, with strokes from 50% of the team's course handicaps.
    { label: 'Scramble', format: 'scramble', text: 'Scramble Game Rules: Each player is required to count one drive, up to a maximum of nine drives for any one player. Rough Forgiveness: if the selected ball is in the rough, the ball may be relocated to within one club length to the nearest fairway edge, but may not be relocated when around the green complex. YR Local Rule can be used. There is no Forgiveness for a ball in a hazard.' },
  ];

  const gameFormat = GAME_OPTIONS.find(g => g.text === game)?.format || 'standard';

  const upcomingDates = teeTimes
    .filter(t => !t.notes?.includes('CLOSED') && t.date >= format(new Date(), 'yyyy-MM-dd'))
    .sort((a, b) => a.date.localeCompare(b.date));

  const handleGenerate = async () => {
    if (!selectedDate) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.functions.invoke('generatePairings', { date: selectedDate, tee, format: gameFormat });
      setResult(res.data);
      setPopulated(false);
      toast.success(`${res.data.groupCount} groups, ${res.data.playerCount} players — ${res.data.courseLabel}`);
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePopulateSheet = async () => {
    setPopulating(true);
    try {
      await api.functions.invoke('populatePairingsSheet', {
        groups: result.groups,
        courseLabel: result.courseLabel,
        date: result.date,
        teeStartTime: result.teeStartTime,
        hiIndexDate: result.hiIndexDate,
        gameText: game,
        format: result.format
      });
      setPopulated(true);
      toast.success('Pairings sheet updated!');
    } catch (err) {
      toast.error(`Failed to update sheet: ${err.message}`);
    } finally {
      setPopulating(false);
    }
  };

  const handleEmailPlayers = async () => {
    setEmailing(true);
    setEmailResult(null);
    try {
      const res = await api.functions.invoke('emailPairings', {
        groups: result.groups,
        date: result.date,
        courseLabel: result.courseLabel,
        teeStartTime: result.teeStartTime
      });
      setEmailResult(res.data);
      toast.success(`Emails sent to ${res.data.sentCount} players`);
    } catch (err) {
      toast.error(`Failed to send emails: ${err.message}`);
    } finally {
      setEmailing(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" />
          Generate Pairings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm text-slate-500 mb-1 block">Select Date</label>
            <Select value={selectedDate} onValueChange={v => { setSelectedDate(v); setResult(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a tee time date..." />
              </SelectTrigger>
              <SelectContent>
                {upcomingDates.map(t => (
                  <SelectItem key={t.date} value={t.date}>
                    {format(parseISO(t.date), 'EEEE, MMMM d, yyyy')}
                    {t.course ? ` — ${t.course}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-slate-500 mb-1 block">Tee</label>
            <Select value={tee} onValueChange={v => { setTee(v); setResult(null); }}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="White">White</SelectItem>
                <SelectItem value="Silver">Silver</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[220px]">
            <label className="text-sm text-slate-500 mb-1 block">Game</label>
            <Select value={game} onValueChange={v => { setGame(v); setResult(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a game..." />
              </SelectTrigger>
              <SelectContent>
                {GAME_OPTIONS.map((g, i) => (
                  <SelectItem key={i} value={g.text}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedDate || loading}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
            Generate & View
          </Button>
        </div>

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handlePopulateSheet}
                disabled={populating || populated}
                className={`flex items-center gap-2 text-white ${populated ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {populating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : populated ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
                {populated ? 'Sheet Updated!' : 'Populate Pairings Sheet'}
              </Button>
              {populated && (
                <a
                  href={pairingsSheetUrl || "https://docs.google.com/spreadsheets/d/1VOsLV3Ly52j8stu_oBipnq6E1p5nO1G6NJxBZBUd6j8/edit"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Open Sheet ↗
                </a>
              )}
              {populated && (
                <Button
                  onClick={handleEmailPlayers}
                  disabled={emailing}
                  className="flex items-center gap-2 text-white bg-emerald-700 hover:bg-emerald-800"
                >
                  {emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Email Players
                </Button>
              )}
              {emailResult && (
                <div className="text-sm text-slate-600 flex flex-wrap gap-3">
                  <span className="text-emerald-700 font-medium">✓ Sent: {emailResult.sentCount}</span>
                  {emailResult.skippedCount > 0 && (
                    <span className="text-amber-600 font-medium">⚠ No email: {emailResult.skippedCount} ({emailResult.skipped.join(', ')})</span>
                  )}
                  {emailResult.failedCount > 0 && (
                    <span className="text-red-600 font-medium">✗ Failed: {emailResult.failedCount}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-500">
                <span className="font-semibold text-emerald-700">{result.playerCount} players</span> in{' '}
                <span className="font-semibold text-emerald-700">{result.groupCount} groups</span>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wide">
                {result.courseLabel} handicaps
              </span>
            </div>

            {result.warning && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ {result.warning}
              </div>
            )}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {result.groups.map(g => (
                <div key={g.group} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Group {g.group}</p>
                    {result.format === 'scramble' && (
                      g.exhibition ? (
                        <span className="text-xs text-slate-500 italic">Exhibition</span>
                      ) : (
                        <span className="text-xs text-slate-600">
                          Team ({g.teamHandicap ?? 'N/A'}), strokes <span className="font-semibold">{g.teamStrokes ?? 'N/A'}</span>
                        </span>
                      )
                    )}
                  </div>
                  {g.players.map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-sm text-slate-700 py-0.5">
                      <span>{p.name}</span>
                      <span className={`text-xs ml-2 ${p.missingHandicap ? 'text-amber-500 font-medium' : 'text-slate-400'}`}>
                        {p.missingHandicap ? 'N/A' : p.handicap}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}