// Scramble team handicaps. Pure math, shared by the pairings generator and the UI.

export const SCRAMBLE_TEAM_PCT = 0.5;

// The HI sheet headers carry the tee's rating as "(CR/Slope/Par)", e.g. "SOUTH\nSILVER\n(68.9/128/72)".
export function parseTeeRating(header) {
  const m = String(header || '').match(/\(\s*([\d.]+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\)/);
  if (!m) return null;
  return { courseRating: Number(m[1]), slope: Number(m[2]), par: Number(m[3]) };
}

// WHS course handicap before rounding. The sheet shows it rounded, but the team total uses the exact value.
export function exactCourseHandicap(hiIndex, rating) {
  return (hiIndex * rating.slope) / 113 + (rating.courseRating - rating.par);
}

// Players need { hiIndex, handicap }. Falls back to the rounded sheet value when there is no index or rating.
export function teamHandicap(players, rating, pct = SCRAMBLE_TEAM_PCT) {
  let total = 0;
  for (const p of players) {
    if (rating && typeof p.hiIndex === 'number' && !Number.isNaN(p.hiIndex)) {
      total += exactCourseHandicap(p.hiIndex, rating);
    } else if (typeof p.handicap === 'number' && !p.missingHandicap) {
      total += p.handicap;
    } else {
      return null;
    }
  }
  return Math.round(total * pct);
}

// Only full foursomes compete. Threesomes play as an exhibition, unless nobody has a foursome.
export function scrambleGroups(groups, rating, pct = SCRAMBLE_TEAM_PCT) {
  const hasFoursome = groups.some((g) => g.length >= 4);
  const scored = groups.map((players) => ({
    players,
    exhibition: hasFoursome && players.length < 4,
    teamHandicap: teamHandicap(players, rating, pct),
  }));
  const competing = scored.filter((g) => !g.exhibition && g.teamHandicap !== null);
  const low = competing.length ? Math.min(...competing.map((g) => g.teamHandicap)) : null;
  return scored.map((g) => ({
    ...g,
    // Strokes are given relative to the lowest team, which plays at scratch.
    teamStrokes: g.exhibition || g.teamHandicap === null || low === null ? null : g.teamHandicap - low,
  }));
}
