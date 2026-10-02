'use client';

import React, { useState } from 'react';
import { format, parseISO, isAfter, startOfToday } from 'date-fns';
import { Users, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';

const MIN_PLAYERS = 4; // minimum for a full foursome

function StatusBadge({ count }) {
  if (count === 0) return <Badge className="bg-red-100 text-red-700 border-0">No signups</Badge>;
  if (count < MIN_PLAYERS) return <Badge className="bg-amber-100 text-amber-700 border-0">Need more</Badge>;
  const foursomes = Math.floor(count / 4);
  const extra = count % 4;
  return (
    <Badge className="bg-emerald-100 text-emerald-700 border-0">
      {foursomes} foursome{foursomes !== 1 ? 's' : ''}{extra > 0 ? ` +${extra}` : ''}
    </Badge>
  );
}

function TeeTimeRow({ teeTime, players, handicapMap }) {
  const [expanded, setExpanded] = useState(false);
  const count = players.length;

  const formattedTime = teeTime.start_time
    ? (() => {
        const [h, m] = teeTime.start_time.split(':');
        const hour = parseInt(h);
        return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
      })()
    : null;

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-all",
      count === 0 ? "border-red-100" : count < MIN_PLAYERS ? "border-amber-100" : "border-emerald-100"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm",
            count === 0 ? "bg-red-100 text-red-600" :
            count < MIN_PLAYERS ? "bg-amber-100 text-amber-600" :
            "bg-emerald-100 text-emerald-700"
          )}>
            {count}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm">
              {format(parseISO(teeTime.date), 'EEE, MMM d')}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {formattedTime && <span>{formattedTime} · </span>}
              {teeTime.course || 'Course TBD'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge count={count} />
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          {players.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No players signed up yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {[...players].sort((a, b) => {
                const getLastName = (name) => (name || '').trim().split(/\s+/).pop().toLowerCase();
                return getLastName(a.player_name).localeCompare(getLastName(b.player_name));
              }).map((p, i) => {
                const lastName = (p.player_name || '').trim().split(/\s+/).pop().toLowerCase();
                const hi = handicapMap?.[lastName];
                return (
                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 text-sm">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                      {p.player_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-gray-800 truncate flex-1">{p.player_name}</span>
                    {hi !== undefined && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{hi}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeeTimeSummary({ teeTimes, availabilities, handicapMap = {} }) {
  const today = startOfToday();

  const upcomingTeeTimes = teeTimes
    .filter(t => !t.notes?.includes('CLOSED') && isAfter(parseISO(t.date), today))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const availsByDate = availabilities.reduce((acc, a) => {
    const d = (a.date || '').split('T')[0];
    if (!acc[d]) acc[d] = [];
    acc[d].push(a);
    return acc;
  }, {});

  const totalSignups = availabilities.filter(a => isAfter(parseISO(a.date), today)).length;
  const datesWithEnough = upcomingTeeTimes.filter(t => {
    const players = availsByDate[(t.date || '').split('T')[0]] || [];
    return players.length >= MIN_PLAYERS;
  }).length;

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Upcoming Tee Time Signups
          </CardTitle>
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1 text-gray-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {datesWithEnough} ready
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              {upcomingTeeTimes.length - datesWithEnough} need players
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {upcomingTeeTimes.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No upcoming tee times scheduled.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {upcomingTeeTimes.map(tt => {
              const dateKey = (tt.date || '').split('T')[0];
              const players = availsByDate[dateKey] || [];
              return <TeeTimeRow key={tt.id} teeTime={tt} players={players} handicapMap={handicapMap} />;
            })}
          </div>
        )}
        {upcomingTeeTimes.length > 0 && (
          <p className="text-xs text-gray-400 mt-4 text-right">{totalSignups} total signups across {upcomingTeeTimes.length} upcoming dates</p>
        )}
      </CardContent>
    </Card>
  );
}