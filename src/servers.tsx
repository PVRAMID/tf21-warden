import { useEffect, useState, type CSSProperties } from "react";
import { Award, ExternalLink, Flag, Play } from "lucide-react";
import { invoke, useRead, type State } from "./bridge";
import type { Tab } from "./main";
import {
  board,
  clock,
  modes,
  ratio,
  spaced,
  standings,
  type LivePlayer,
  type Match,
} from "./match";

type Go = (tab: Tab, slug?: string | null) => void;
export type ServerRow = {
  slug: string;
  name: string;
  status: {
    state: string;
    online: boolean;
    uptime_ms?: number;
    note?: string;
    match?: Match | null;
    /** Only there when the server publishes who is on it. */
    players?: LivePlayer[];
    facts?: { region?: string };
    seeding?: {
      active: boolean;
      smart?: { target_players?: number } | null;
    };
  };
};
type Fleet = { servers: ServerRow[] };

const open = (url: string) => invoke("open_url", { url });

/** The fleet, read again every `ms`, with when it was last read: the match clock runs on from it. */
export function useServers(ms: number) {
  const data = useRead<Fleet>("/api/servers", ms);
  const [at, setAt] = useState(Date.now());
  useEffect(() => setAt(Date.now()), [data]);
  return { servers: data?.servers, at };
}

/** A clock tick, for anything that counts by the second. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const stateOf = (server: ServerRow) =>
  !server.status.online
    ? "Offline"
    : server.status.seeding?.active
      ? "Seeding now"
      : server.status.match
        ? "Live"
        : "Between matches";

/** Join from a button: Steam is handed the link; with nobody joinable, the Server ID is shown. */
function useJoin(slug: string) {
  const [error, setError] = useState("");
  // Set when nobody on the server could be joined through Steam: the ID to join by hand.
  const [code, setCode] = useState<string | null>(null);
  const join = () => {
    setError("");
    setCode(null);
    invoke<{ opened: boolean; code: string | null }>("join_link", { slug })
      .then((r) => {
        if (!r.opened) setCode(r.code || "");
      })
      .catch((e) => setError(String(e)));
  };
  return { join, error, code };
}

function JoinHelp({ error, code }: { error: string; code: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      {error && <p className="notice">{error}</p>}
      {code !== null && (
        <div className="impact">
          Nobody on the server can be joined through Steam right now. In WARDOGS
          choose Deploy, Community, Join by ID
          {code ? " and paste this Server ID:" : "."}
          {code && (
            <div className="actions">
              <b className="server-id">{code}</b>
              <button
                type="button"
                className="text"
                onClick={() =>
                  navigator.clipboard.writeText(code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                }
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Fill({ match }: { match?: Match | null }) {
  const players = match?.players;
  return (
    <div className="fill" aria-hidden="true">
      <i
        style={{
          width: `${players ? (players.current / players.max) * 100 : 0}%`,
        }}
      />
    </div>
  );
}

/** The score, a line a faction, the leader's lit in its own colour. */
function Score({ match }: { match: Match }) {
  const rows = standings(match);
  if (!rows.length) return <p className="small">No score yet.</p>;
  return (
    <ol className="score">
      {rows.map((f) => (
        <li
          key={f.name}
          className={f.leads ? "leads" : ""}
          style={{ "--faction": f.color } as CSSProperties}
        >
          <span>{f.name}</span>
          <b key={f.score}>{f.score}</b>
          <div className="bar-track" aria-hidden="true">
            <i style={{ width: `${Math.max(f.share * 100, 1.5)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The home screen's card: who is on, what map, the score at a glance. */
export function ServerCard({
  server,
  state,
  at,
}: {
  server: ServerRow;
  state: State;
  at: number;
}) {
  const now = useNow();
  const { join, error, code } = useJoin(server.slug);
  const match = server.status.match;
  const players = match?.players;
  return (
    <div className="panel server">
      <span className="eyebrow">
        <i className={`dot ${server.status.online ? "live" : "hot"}`} />
        {stateOf(server)}
      </span>
      <h2 title={server.name}>{server.name}</h2>
      <div className="count">
        <span key={players?.current} className={players ? "gold flip" : ""}>
          {players?.current ?? "—"}
        </span>
        <em>/ {players?.max ?? "—"}</em>
      </div>
      <Fill match={match} />
      <div className="facts">
        <span>
          Map <b>{match?.map || "—"}</b>
        </span>
        {match?.match_seconds != null && (
          <span>
            Clock <b>{clock(match.match_seconds + (now - at) / 1000)}</b>
          </span>
        )}
        {standings(match || {}).map((f) => (
          <span key={f.name} className="pip" style={{ color: f.color }}>
            {f.name} <b>{f.score}</b>
          </span>
        ))}
      </div>
      <JoinHelp error={error} code={code} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!server.status.online || !state.game_installed}
          onClick={join}
        >
          <Play size={13} /> Join
        </button>
        <button
          type="button"
          className="text"
          onClick={() => open(`/join/${server.slug}`)}
        >
          Join page <ExternalLink size={11} />
        </button>
      </div>
      {!state.game_installed && (
        <p className="small">WARDOGS is not installed on this PC.</p>
      )}
    </div>
  );
}

/** The Servers screen's card: the whole match, as far as the server publishes it. */
function ServerBoard({
  server,
  state,
  at,
  now,
  go,
}: {
  server: ServerRow;
  state: State;
  at: number;
  now: number;
  go: Go;
}) {
  const { join, error, code } = useJoin(server.slug);
  const { status } = server;
  const match = status.match;
  const players = match?.players;
  const ranked = status.players ? board(status.players) : null;
  const mvp = ranked?.[0];
  const colour = (faction: string) =>
    match?.factions?.find((f) => f.name === faction)?.color;
  const target = status.seeding?.smart?.target_players;
  const tags = match
    ? [...modes(match), ...(match.lighting ? [spaced(match.lighting)] : [])]
    : [];
  return (
    <div className={`panel board ${status.online ? "" : "down"}`}>
      <div className="board-head">
        <div>
          <span className="eyebrow">
            <i className={`dot ${status.online ? "live" : "hot"}`} />
            {stateOf(server)}
            {status.facts?.region && <span>· {status.facts.region}</span>}
          </span>
          <h2>{server.name}</h2>
          {tags.length > 0 && (
            <div className="tags">
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
        </div>
        {match?.match_seconds != null && (
          <div className="match-clock" role="timer">
            <b>{clock(match.match_seconds + (now - at) / 1000)}</b>
            <span className="label">Match time</span>
          </div>
        )}
      </div>
      {status.note && <p className="impact">{status.note}</p>}
      <div className="board-grid">
        <div className="board-cell">
          <span className="label">On the server</span>
          <div className="count">
            <span key={players?.current} className={players ? "gold flip" : ""}>
              {players?.current ?? "—"}
            </span>
            <em>/ {players?.max ?? "—"}</em>
          </div>
          <Fill match={match} />
          <div className="facts">
            <span>
              Map <b>{match?.map || "—"}</b>
            </span>
            {status.seeding?.active && target && (
              <span>
                Seeded at <b>{target}</b>
              </span>
            )}
            {match?.score_cap ? (
              <span>
                First to <b>{match.score_cap}</b>
              </span>
            ) : null}
          </div>
        </div>
        <div className="board-cell">
          <span className="label">The score</span>
          {match ? (
            <Score match={match} />
          ) : (
            <p className="small">
              {status.online
                ? "The next match has not started yet."
                : "The server is not answering."}
            </p>
          )}
        </div>
        <div className="board-cell">
          <span className="label">
            <Award size={11} /> MVP so far
          </span>
          {mvp ? (
            <>
              <div className="mvp">
                <b
                  className="gold"
                  title={mvp.name}
                  style={{ "--faction": colour(mvp.faction) } as CSSProperties}
                >
                  {mvp.name}
                </b>
                <dl>
                  <div>
                    <dt>Kills</dt>
                    <dd key={mvp.kills} className="flip">
                      {mvp.kills}
                    </dd>
                  </div>
                  <div>
                    <dt>Deaths</dt>
                    <dd>{mvp.deaths}</dd>
                  </div>
                  <div>
                    <dt>K/D</dt>
                    <dd>{ratio(mvp)}</dd>
                  </div>
                </dl>
              </div>
              <ol className="chasers">
                {ranked!.slice(1, 4).map((p, i) => (
                  <li key={p.name}>
                    <span>{i + 2}</span>
                    <i style={{ background: colour(p.faction) }} />
                    <b title={p.name}>{p.name}</b>
                    <em>
                      {p.kills} / {p.deaths}
                    </em>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="small">
              {ranked
                ? "Nobody is on the board yet."
                : "This server does not publish who is playing."}
            </p>
          )}
        </div>
      </div>
      <JoinHelp error={error} code={code} />
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!status.online || !state.game_installed}
          onClick={join}
        >
          <Play size={13} /> Join
        </button>
        <button
          type="button"
          className="text"
          onClick={() => open(`/join/${server.slug}`)}
        >
          Join page <ExternalLink size={11} />
        </button>
        <button
          type="button"
          className="text push"
          onClick={() => go("report", server.slug)}
        >
          <Flag size={11} /> Report a player
        </button>
      </div>
      {!state.game_installed && (
        <p className="small">WARDOGS is not installed on this PC.</p>
      )}
    </div>
  );
}

export function Servers({ state, go }: { state: State; go: Go }) {
  const { servers, at } = useServers(10000);
  const now = useNow();
  const on = servers?.reduce(
    (n, s) => n + (s.status.match?.players.current || 0),
    0,
  );
  return (
    <section>
      <span className="eyebrow">
        The servers
        {on != null && <span>· {on} on now</span>}
      </span>
      <h1>
        PICK A <em>FIGHT.</em>
      </h1>
      <p className="lead">
        The match as it stands on each server. Join hands Steam a link to
        somebody already there, and Steam takes you in: WARDEN does not touch
        your mouse or keyboard for it.
      </p>
      <div className="boards">
        {servers?.map((s) => (
          <ServerBoard
            key={s.slug}
            server={s}
            state={state}
            at={at}
            now={now}
            go={go}
          />
        ))}
        {!servers && (
          <div className="panel board skeleton" aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
