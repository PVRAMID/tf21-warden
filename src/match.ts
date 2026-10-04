// What the Servers screen works out from a server's public status. Nothing here touches the
// page, so the website's own test run checks it (tests/warden-app.test.mjs).

export type Faction = { name: string; color: string; score: number };
export type LivePlayer = {
  name: string;
  faction: string;
  kills: number;
  deaths: number;
};
export type Match = {
  map: string;
  experiences?: string[];
  lighting?: string;
  match_seconds?: number;
  score_cap?: number | null;
  players: { current: number; max: number };
  factions?: Faction[];
};

/** 754 is "12:34"; past the hour, "1:02:34". */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)];
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** The words the game runs together: "DayEarlyClear" is "Day Early Clear". */
export const spaced = (text: string) =>
  text
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

/** What is being played, from the experience names, without the map or the numbering. */
export function modes(match: Pick<Match, "map" | "experiences">) {
  const seen = new Set<string>();
  for (const experience of match.experiences || [])
    for (const word of experience.split("_"))
      if (!/^\d*$/.test(word) && word.toLowerCase() !== match.map.toLowerCase())
        seen.add(spaced(word));
  return [...seen];
}

/** Kills for every death, to two places; nobody is divided by zero. */
export const ratio = (p: Pick<LivePlayer, "kills" | "deaths">) =>
  (p.kills / Math.max(p.deaths, 1)).toFixed(2);

/** The board, best first: most kills, then fewest deaths. The first of them is the MVP. */
export const board = (players: LivePlayer[]) =>
  [...players].sort(
    (a, b) =>
      b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name),
  );

/**
 * The factions, leader first, each with how much of its bar is filled: of the score cap when
 * the match has one, otherwise of the leading score. Level scores lead nobody.
 */
export function standings(match: Pick<Match, "factions" | "score_cap">) {
  const factions = [...(match.factions || [])].sort(
    (a, b) => b.score - a.score,
  );
  const top = factions[0]?.score || 0;
  const full = match.score_cap || top;
  return factions.map((f) => ({
    ...f,
    share: full ? Math.min(1, f.score / full) : 0,
    leads: f.score === top && top > (factions[1]?.score ?? -1),
  }));
}
