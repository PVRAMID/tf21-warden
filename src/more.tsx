import { useState } from "react";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { invoke, useRead, type State } from "./bridge";
import { CHANGELOG, type Release } from "./changelog";
import type { Tab } from "./main";

type Go = (tab: Tab, slug?: string | null) => void;
type Totals = {
  kills: number;
  deaths: number;
  kd: number;
  matches: number;
  play_seconds: number;
  last_seen: string | null;
} | null;
type RecordData = {
  signed_in: boolean;
  steam_linked?: boolean;
  servers?: {
    slug: string;
    name: string;
    number: number;
    totals: Totals;
    month: Totals;
    recent: {
      map: string;
      started_at: string;
      kills: number;
      deaths: number;
      faction: string | null;
      play_seconds: number;
      winner: string | null;
    }[];
  }[];
  seeding?: { seconds: number; sessions: number };
  wallet?: {
    enabled: boolean;
    balance?: number;
    earned?: number;
    week?: number;
    rank?: number;
    holders?: number;
    recent: {
      id: number;
      source: string;
      day: string;
      amount: number;
      note: string;
    }[];
  };
};
type Competition = {
  slug: string;
  name: string;
  description: string;
  metric_label: string;
  scope_label: string;
  state: "live" | "upcoming" | "ended" | string;
  starts_at: string;
  ends_at: string | null;
};
type Standing = {
  key: string;
  name: string;
  place: number | null;
  value_text: string;
  tf21: { callsign: string } | null;
};
type Board = {
  slug: string;
  title: string;
  description: string;
  measurement: { label: string };
};
type BoardRow = { rank: number; id: string; callsign: string; value: number };

const hours = (seconds: number) =>
  seconds >= 3600
    ? `${(seconds / 3600).toFixed(seconds >= 36000 ? 0 : 1)} h`
    : `${Math.round(seconds / 60)} min`;
const number = (n: number | undefined) => (n ?? 0).toLocaleString("en-GB");
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Figures({ items }: { items: [string, string][] }) {
  return (
    <dl className="figures">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          {/* "4 of 212": the figure, then its measure in small print. */}
          <dd>
            {value.split(" of ")[0]}
            {value.includes(" of ") && (
              <small> of {value.split(" of ")[1]}</small>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The signed-in member's own numbers: each server, seeding and the wallet. */
export function Record({ state, go }: { state: State; go: Go }) {
  const signedIn = Boolean(state.me?.profile);
  const data = useRead<RecordData>(signedIn ? "/api/app/record" : null, 60000);
  return (
    <section>
      <span className="eyebrow">
        {state.me?.profile ? state.me.profile.callsign : "Your service record"}
      </span>
      <h1>
        MY <em>RECORD.</em>
      </h1>
      {!signedIn ? (
        <div className="impact">
          Sign in to see your own statistics, seeding time and Tascoin.{" "}
          <button type="button" className="text" onClick={() => go("settings")}>
            Sign in
          </button>
        </div>
      ) : !data ? (
        <p className="small">Reading your record…</p>
      ) : (
        <>
          {!data.steam_linked && (
            <div className="impact">
              Link your Steam account on tf21.net and your server statistics
              appear here.{" "}
              <button
                type="button"
                className="text"
                onClick={() => invoke("open_url", { url: "/link/steam" })}
              >
                Link Steam <ExternalLink size={11} />
              </button>
            </div>
          )}
          <div className="cols">
            <div className="panel">
              <h2>Seeding</h2>
              <Figures
                items={[
                  ["Time seeding", hours(data.seeding?.seconds || 0)],
                  ["Sessions", number(data.seeding?.sessions)],
                ]}
              />
            </div>
            <div className="panel">
              <h2>Tascoin</h2>
              {data.wallet?.enabled ? (
                <>
                  <Figures
                    items={[
                      ["Balance", number(data.wallet.balance)],
                      ["Last 7 days", `+${number(data.wallet.week)}`],
                      [
                        "Rank",
                        `${number(data.wallet.rank)} of ${number(data.wallet.holders)}`,
                      ],
                    ]}
                  />
                  <ul className="ledger">
                    {data.wallet.recent.map((e) => (
                      <li key={e.id}>
                        <span>{e.note || e.source.replaceAll("_", " ")}</span>
                        <b className={e.amount < 0 ? "minus" : ""}>
                          {e.amount > 0 ? "+" : ""}
                          {number(e.amount)}
                        </b>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="small">Tascoin is not switched on yet.</p>
              )}
            </div>
          </div>
          {data.servers?.map((s) => (
            <div className="panel" key={s.slug}>
              <div className="panel-head">
                <div>
                  <h2>Server #{s.number}</h2>
                  <p className="small">{s.name}</p>
                </div>
              </div>
              {s.totals ? (
                <>
                  <Figures
                    items={[
                      ["Kills", number(s.totals.kills)],
                      ["Deaths", number(s.totals.deaths)],
                      ["K/D", s.totals.kd.toFixed(2)],
                      ["Matches", number(s.totals.matches)],
                      ["Time played", hours(s.totals.play_seconds)],
                    ]}
                  />
                  {s.month && (
                    <p className="small">
                      Last 30 days: {number(s.month.kills)} kills,{" "}
                      {s.month.kd.toFixed(2)} K/D, {number(s.month.matches)}{" "}
                      matches, {hours(s.month.play_seconds)}.
                    </p>
                  )}
                  {s.recent.length > 0 && (
                    <table className="table" aria-label="Recent matches">
                      <thead>
                        <tr>
                          <th>Match</th>
                          <th>Side</th>
                          <th>K / D</th>
                          <th>Played</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.recent.map((m, i) => (
                          <tr key={i}>
                            <td>
                              {m.map || "—"} · {day(m.started_at)}
                            </td>
                            <td>{m.faction || "—"}</td>
                            <td>
                              {m.kills} / {m.deaths}
                            </td>
                            <td>{hours(m.play_seconds)}</td>
                            <td>
                              {!m.winner
                                ? "—"
                                : m.winner === m.faction
                                  ? "Won"
                                  : "Lost"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <p className="small">No matches recorded on this server yet.</p>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function Competitions() {
  const [slug, setSlug] = useState<string | null>(null);
  const list = useRead<{ competitions: Competition[] }>(
    "/api/competitions",
    120000,
  );
  const detail = useRead<{ competition: Competition; players: Standing[] }>(
    slug ? `/api/competitions/${slug}` : null,
    60000,
  );
  if (slug)
    return (
      <section>
        <div className="actions">
          <button type="button" className="text" onClick={() => setSlug(null)}>
            <ArrowLeft size={11} /> All competitions
          </button>
          <button
            type="button"
            className="text"
            onClick={() => invoke("open_url", { url: `/competitions/${slug}` })}
          >
            Rules and prizes on tf21.net <ExternalLink size={11} />
          </button>
        </div>
        {detail && (
          <>
            <span className="eyebrow">
              <i
                className={`dot ${detail.competition.state === "live" ? "live" : ""}`}
              />
              {detail.competition.state} · {detail.competition.metric_label}
            </span>
            <h1 style={{ fontSize: 44 }}>{detail.competition.name}</h1>
            <p className="lead">{detail.competition.description}</p>
            <table className="table" aria-label="Standings">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>{detail.competition.metric_label}</th>
                </tr>
              </thead>
              <tbody>
                {detail.players.slice(0, 25).map((p) => (
                  <tr key={p.key}>
                    <td>{p.place ?? "—"}</td>
                    <td>{p.tf21?.callsign || p.name}</td>
                    <td>{p.value_text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!detail.players.length && (
              <p className="small">Nobody is on the board yet.</p>
            )}
          </>
        )}
      </section>
    );
  return (
    <section>
      <span className="eyebrow">Prizes on the line</span>
      <h1>
        THE <em>COMPETITIONS.</em>
      </h1>
      <ul className="rows">
        {list?.competitions.map((c) => (
          <li
            key={c.slug}
            className="clickable"
            onClick={() => setSlug(c.slug)}
          >
            <span className="meta">
              <span>{c.state}</span>
              <span>{c.metric_label}</span>
              <span>
                {day(c.starts_at)}
                {c.ends_at ? ` to ${day(c.ends_at)}` : ""}
              </span>
            </span>
            <b>{c.name}</b>
            <p>{c.description}</p>
          </li>
        ))}
        {list && !list.competitions.length && (
          <li className="empty">No competitions are running at the moment.</li>
        )}
      </ul>
    </section>
  );
}

export function Leaderboards() {
  const [slug, setSlug] = useState<string | null>(null);
  const list = useRead<{ boards: Board[] }>("/api/leaderboards", 120000);
  const detail = useRead<{ board: Board; rows: BoardRow[] }>(
    slug ? `/api/leaderboards/${slug}` : null,
    60000,
  );
  if (slug)
    return (
      <section>
        <div className="actions">
          <button type="button" className="text" onClick={() => setSlug(null)}>
            <ArrowLeft size={11} /> All leaderboards
          </button>
        </div>
        {detail && (
          <>
            <span className="eyebrow">{detail.board.measurement.label}</span>
            <h1 style={{ fontSize: 44 }}>{detail.board.title}</h1>
            <p className="lead">{detail.board.description}</p>
            <table className="table" aria-label="Leaderboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Member</th>
                  <th>{detail.board.measurement.label}</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rank}</td>
                    <td>{r.callsign}</td>
                    <td>{number(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    );
  return (
    <section>
      <span className="eyebrow">Who leads</span>
      <h1>
        THE <em>LEADERBOARDS.</em>
      </h1>
      <ul className="rows">
        {list?.boards.map((b) => (
          <li
            key={b.slug}
            className="clickable"
            onClick={() => setSlug(b.slug)}
          >
            <span className="meta">
              <span>{b.measurement.label}</span>
            </span>
            <b>{b.title}</b>
            <p>{b.description}</p>
          </li>
        ))}
        {list && !list.boards.length && (
          <li className="empty">No leaderboards are published yet.</li>
        )}
      </ul>
    </section>
  );
}

export function Changelog({ version }: { version: string }) {
  return (
    <section>
      <span className="eyebrow">You are on version {version}</span>
      <h1>
        WHAT'S <em>NEW.</em>
      </h1>
      <Releases items={CHANGELOG} />
    </section>
  );
}

const CRITICAL = {
  security: "Security update",
  functionality: "Critical fix",
};

function Releases({ items }: { items: Release[] }) {
  return (
    <>
      {items.map((r) => (
        <div className="panel" key={r.version}>
          <div className="panel-head">
            <span className="numeral" aria-hidden="true">
              {r.version}
            </span>
            <div>
              <h2>{r.title}</h2>
              <p className="small">
                {day(r.date)} · by {r.author}
                {r.critical && <b className="hot"> · {CRITICAL[r.critical]}</b>}
              </p>
            </div>
          </div>
          <ul className="terms-list">
            {r.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * The Update page: what a newer version changes, and the button that installs it. Updating is
 * the user's choice, so this is an ordinary page. A critical update makes it the only page: the
 * core has shut the app off, and the ways out are to update, uninstall or close.
 */
export function Update({ state }: { state: State }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = state.update;
  const act = (command: string) => {
    setBusy(true);
    setError("");
    invoke(command).catch((e) => {
      setBusy(false);
      setError(String(e));
    });
  };
  if (!update)
    return (
      <section className="terms boot">
        <span className="eyebrow">
          <i className="dot live" />
          Starting up
        </span>
        <h1>
          CHECKING FOR <em>UPDATES.</em>
        </h1>
        <p className="lead">
          WARDEN makes sure it is the current version before it does anything
          else.
        </p>
      </section>
    );
  const locked = update.critical;
  return (
    <section className={locked ? "terms" : undefined}>
      <span className="eyebrow">
        <i className={`dot ${locked ? "hot" : "live"}`} />
        {locked ? `${CRITICAL[locked]} · ` : ""}
        Version {update.version} is out · you have {state.version}
      </span>
      <h1>
        {locked ? (
          <>
            UPDATE <em>REQUIRED.</em>
          </>
        ) : (
          <>
            AN UPDATE <em>IS OUT.</em>
          </>
        )}
      </h1>
      <p className="lead">
        {locked === "security" &&
          "This update fixes a security problem, so WARDEN has shut itself off on this PC until it is installed. It is not connected to TF21 and will not answer seed calls. Update to carry on, or uninstall WARDEN if you would rather not."}
        {locked === "functionality" &&
          "This version of WARDEN can no longer work with tf21.net, so it has shut itself off until the update is installed. Update to carry on, or uninstall WARDEN if you would rather not."}
        {!locked &&
          "Updating is your choice: nothing is installed unless you press Update now, and WARDEN carries on working as it is until you do. This is what the update changes."}
      </p>
      {update.changes.length ? (
        <Releases items={update.changes} />
      ) : (
        update.notes && <p className="impact">{update.notes}</p>
      )}
      <p className="small">
        Updating takes a few seconds. The update is checked against TF21's
        signature before it is installed, the app restarts by itself, and it
        shows you its terms again.
      </p>
      {error && <p className="notice">{error}</p>}
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => act("install_update")}
        >
          <Download size={13} /> {busy ? "Updating…" : "Update now"}
        </button>
        {locked && (
          <>
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => act("uninstall")}
            >
              Uninstall WARDEN
            </button>
            <button
              type="button"
              className="text"
              onClick={() => invoke("quit")}
            >
              Close WARDEN
            </button>
          </>
        )}
      </div>
    </section>
  );
}
