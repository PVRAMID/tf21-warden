import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Flag,
  ImagePlus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { ago, api, invoke, type State } from "./bridge";
import type { Tab } from "./main";

// Reporting a player, the way tf21.net/report does it, without leaving the app. The questions,
// limits and wording all come from the website (GET /api/app/reports/config), so the two forms
// cannot drift apart; the website validates every report again when it arrives.

type Go = (tab: Tab, slug?: string | null) => void;
type Question = {
  id: string;
  label: string;
  type: "multiselect" | "radio" | "select" | "textarea" | "text" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};
type ReportType = {
  id: string;
  label: string;
  short: string;
  questions: Question[];
};
type Config = {
  enabled: boolean;
  intro: string;
  types: ReportType[];
  servers: { id: string; slug: string; name: string }[];
  evidence: {
    intro: string;
    standards: string[];
    noClip: string;
    medalUrl: string;
    fallback: string;
  };
  limits: {
    description_min: number;
    text_max: number;
    clips: number;
    screenshots: number;
    window_days: number;
  };
  me: { steam_linked: boolean };
};
type Found = {
  steam_id: string;
  name: string;
  names: string[];
  last_seen: string | null;
  matches: number;
  online: { slug: string; name: string } | null;
};
type Mine = {
  ref: string;
  type: string;
  suspect_name: string;
  status: "open" | "reviewing" | "closed";
  outcome: string | null;
  created_at: string;
  unread: boolean;
};
type Shot = { id: string; name: string; preview: string };
type Draft = {
  step: number;
  type: string;
  suspect: Found | null;
  clips: string[];
  shots: Shot[];
  server: string | null;
  when: string;
  answers: Record<string, unknown>;
  description: string;
  witnesses: string;
  consent: boolean;
};

const STEPS = ["What", "Who", "Evidence", "Details", "Review"];
const STATUS = { open: "Waiting", reviewing: "Under review", closed: "Closed" };
const OUTCOME: Record<string, string> = {
  actioned: "Action taken",
  insufficient_evidence: "Insufficient evidence",
  not_upheld: "Not upheld",
  duplicate: "Duplicate",
};
const PICTURES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const SHOT_BYTES = 8 * 1024 * 1024;
const open = (url: string) => invoke("open_url", { url });
const isClip = (url: string) => /^https:\/\/\S+\.\S+/.test(url.trim());
// The value a datetime-local field takes for a moment in this PC's own time.
const localStamp = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const blank = (): Draft => ({
  step: 0,
  type: "",
  suspect: null,
  clips: [""],
  shots: [],
  server: null,
  when: "",
  answers: {},
  description: "",
  witnesses: "",
  consent: false,
});
// A report half written survives a look at another tab, for as long as the app stays open.
let kept: Draft | null = null;

function Choice({
  options,
  value,
  many,
  onChange,
}: {
  options: string[];
  value: unknown;
  many: boolean;
  onChange: (next: unknown) => void;
}) {
  const picked = many ? ((value as string[]) ?? []) : [value as string];
  return (
    <div className="chips">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={`chip ${picked.includes(option) ? "on" : ""}`}
          aria-pressed={picked.includes(option)}
          onClick={() =>
            onChange(
              many
                ? picked.includes(option)
                  ? picked.filter((o) => o !== option)
                  : [...picked, option]
                : value === option
                  ? null
                  : option,
            )
          }
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Ask({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  return (
    <div className="field">
      <span className="label">
        {question.label}
        {question.required ? "" : " (optional)"}
      </span>
      {question.type === "textarea" ? (
        <textarea
          className="input"
          rows={3}
          value={(value as string) || ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : question.type === "text" ? (
        <input
          className="input"
          maxLength={200}
          value={(value as string) || ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : question.type === "checkbox" ? (
        <Choice
          options={["Yes"]}
          many={false}
          value={value ? "Yes" : null}
          onChange={(v) => onChange(Boolean(v))}
        />
      ) : (
        <Choice
          options={question.options || []}
          many={question.type === "multiselect"}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** The answers as the website expects them: every question present, in its own shape. */
function answersOf(type: ReportType, given: Record<string, unknown>) {
  return Object.fromEntries(
    type.questions.map((q) => [
      q.id,
      q.type === "multiselect"
        ? ((given[q.id] as string[]) ?? [])
        : q.type === "checkbox"
          ? Boolean(given[q.id])
          : q.type === "radio" || q.type === "select"
            ? (given[q.id] ?? null)
            : String(given[q.id] ?? "").trim(),
    ]),
  );
}
const answered = (type: ReportType, given: Record<string, unknown>) =>
  type.questions.every((q) => {
    if (!q.required) return true;
    const value = answersOf(type, given)[q.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

function Who({
  chosen,
  choose,
}: {
  chosen: Found | null;
  choose: (player: Found | null) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ players: Found[]; online: number }>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (chosen) return;
    let alive = true;
    // A name needs two characters; nothing typed lists who is on now and who played today.
    const timer = setTimeout(
      () =>
        api<{ players: Found[]; online: number }>(
          `/api/app/reports/players?q=${encodeURIComponent(q.trim())}`,
        )
          .then((r) => alive && (setFound(r), setError("")))
          .catch((e) => alive && setError(String(e))),
      q ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, chosen]);
  if (chosen)
    return (
      <div className="chosen">
        <div>
          <span className="label">Reporting</span>
          <b>{chosen.name}</b>
          <span className="small">
            {chosen.steam_id}
            {chosen.names.length
              ? ` · also seen as ${chosen.names.join(", ")}`
              : ""}
          </span>
        </div>
        <button type="button" className="text" onClick={() => choose(null)}>
          Change
        </button>
      </div>
    );
  return (
    <>
      <label className="search">
        <Search size={15} aria-hidden="true" />
        <input
          className="input"
          autoFocus
          value={q}
          placeholder="An in-game name or a SteamID64"
          aria-label="Find the player"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {error && <p className="notice">{error}</p>}
      <ul className="rows found">
        {found?.players.map((p) => (
          <li key={p.steam_id} className="clickable" onClick={() => choose(p)}>
            <b>{p.name}</b>
            <span className="meta">
              {p.online && (
                <span className="on-now">
                  <i className="dot live" /> On {p.online.name} now
                </span>
              )}
              {!p.online && p.last_seen && (
                <span>Last seen {ago(p.last_seen)}</span>
              )}
              {p.matches > 0 && <span>{p.matches} matches</span>}
              {p.names.length > 0 && <span>Also {p.names.join(", ")}</span>}
            </span>
          </li>
        ))}
        {found && !found.players.length && (
          <li className="empty">
            {q.trim().length === 1
              ? "Type at least two characters."
              : q
                ? "Nobody by that name has been on our servers."
                : "Nobody has been on today. Search for a name."}
          </li>
        )}
      </ul>
    </>
  );
}

function Evidence({
  config,
  draft,
  set,
}: {
  config: Config;
  draft: Draft;
  set: (change: Partial<Draft>) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { limits, evidence } = config;
  const add = async (files: FileList | null) => {
    setError("");
    let shots = draft.shots;
    for (const file of Array.from(files || [])) {
      if (shots.length >= limits.screenshots)
        return setError(`Up to ${limits.screenshots} screenshots a report.`);
      if (!PICTURES.includes(file.type))
        return setError("Screenshots are PNG, JPEG, WebP or GIF pictures.");
      if (file.size > SHOT_BYTES)
        return setError("A screenshot can be up to 8 MB.");
      setBusy(true);
      try {
        const preview = await new Promise<string>((done, fail) => {
          const reader = new FileReader();
          reader.onload = () => done(String(reader.result));
          reader.onerror = () =>
            fail(new Error("That picture could not be read."));
          reader.readAsDataURL(file);
        });
        const saved = await invoke<{ id: string; name: string }>("attach", {
          name: file.name,
          mime: file.type,
          data: preview.slice(preview.indexOf(",") + 1),
        });
        shots = [...shots, { id: saved.id, name: file.name, preview }];
        set({ shots });
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    }
  };
  const remove = (shot: Shot) => {
    set({ shots: draft.shots.filter((s) => s.id !== shot.id) });
    void api(`/api/app/reports/evidence/${shot.id}`, "DELETE").catch(() => {});
  };
  return (
    <>
      <p>{evidence.intro}</p>
      <ul className="terms-list">
        {evidence.standards.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="field">
        <span className="label">Clip links (up to {limits.clips})</span>
        {draft.clips.map((clip, i) => (
          <div className="clip" key={i}>
            <input
              className={`input ${clip && !isClip(clip) ? "bad" : ""}`}
              type="url"
              value={clip}
              placeholder="https://medal.tv/…"
              aria-label={`Clip link ${i + 1}`}
              onChange={(e) =>
                set({
                  clips: draft.clips.map((c, j) =>
                    j === i ? e.target.value : c,
                  ),
                })
              }
            />
            {draft.clips.length > 1 && (
              <button
                type="button"
                className="text"
                aria-label={`Remove clip link ${i + 1}`}
                onClick={() =>
                  set({ clips: draft.clips.filter((_, j) => j !== i) })
                }
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        {draft.clips.length < limits.clips && (
          <button
            type="button"
            className="text"
            onClick={() => set({ clips: [...draft.clips, ""] })}
          >
            <Plus size={11} /> Another clip
          </button>
        )}
      </div>
      <div className="field">
        <span className="label">
          Screenshots (up to {limits.screenshots}, 8 MB each)
        </span>
        <div className="shots">
          {draft.shots.map((shot) => (
            <figure key={shot.id}>
              <img src={shot.preview} alt={shot.name} />
              <button
                type="button"
                aria-label={`Remove ${shot.name}`}
                onClick={() => remove(shot)}
              >
                <X size={12} />
              </button>
            </figure>
          ))}
          {draft.shots.length < limits.screenshots && (
            <button
              type="button"
              className="add-shot"
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              <ImagePlus size={18} />
              {busy ? "Attaching…" : "Attach"}
            </button>
          )}
        </div>
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          accept={PICTURES.join(",")}
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="notice">{error}</p>}
      <p className="small">
        {evidence.noClip}{" "}
        <button
          type="button"
          className="text inline"
          onClick={() => open(evidence.medalUrl)}
        >
          medal.tv <ExternalLink size={10} />
        </button>
      </p>
      <p className="impact">{evidence.fallback}</p>
    </>
  );
}

function Wizard({
  config,
  start,
  leave,
  done,
}: {
  config: Config;
  start: Draft;
  leave: () => void;
  done: (ref: string) => void;
}) {
  const [draft, setDraft] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (change: Partial<Draft>) =>
    setDraft((d) => (kept = { ...d, ...change }));
  const type = config.types.find((t) => t.id === draft.type);
  const { limits } = config;
  const clips = draft.clips.map((c) => c.trim()).filter(Boolean);
  const length = draft.description.trim().length;
  const now = new Date();
  // What still stands between this step and the next, in words; nothing means carry on.
  const missing = [
    !type && "Pick what you are reporting.",
    !draft.suspect && "Pick the player.",
    clips.some((c) => !isClip(c)) && "Clip links start with https://",
    !type
      ? ""
      : !answered(type, draft.answers)
        ? "Answer the questions that are not marked optional."
        : length < limits.description_min &&
          `Describe what happened in at least ${limits.description_min} characters (${length} so far).`,
    !draft.consent &&
      "Confirm the report is true to the best of your knowledge.",
  ][draft.step];
  const submit = () => {
    if (!type || !draft.suspect) return;
    setBusy(true);
    setError("");
    api<{ report: { ref: string } }>("/api/app/reports", "POST", {
      type: type.id,
      suspect_steam_id: draft.suspect.steam_id,
      suspect_name: draft.suspect.name,
      server_id: draft.server,
      occurred_at: draft.when ? new Date(draft.when).toISOString() : null,
      description: draft.description.trim(),
      witnesses: draft.witnesses.trim(),
      answers: answersOf(type, draft.answers),
      clips,
      evidence: draft.shots.map((s) => s.id),
      uploads: [],
      consent: true,
    })
      .then((r) => {
        kept = null;
        done(r.report.ref);
      })
      .catch((e) => {
        setBusy(false);
        setError(String(e));
      });
  };
  return (
    <section className="terms report">
      <span className="eyebrow">
        <Flag size={11} /> Report a player
      </span>
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              i < draft.step ? "past" : i === draft.step ? "now" : undefined
            }
            aria-current={i === draft.step ? "step" : undefined}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="panel wizard-card" key={draft.step}>
        {draft.step === 0 && (
          <>
            <h1>
              WHAT <em>HAPPENED?</em>
            </h1>
            <div className="picks">
              {config.types.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`pick ${draft.type === t.id ? "on" : ""}`}
                  aria-pressed={draft.type === t.id}
                  onClick={() => set({ type: t.id, answers: {} })}
                >
                  <b>{t.label}</b>
                  <span>{t.short}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {draft.step === 1 && (
          <>
            <h1>
              WHO <em>WAS IT?</em>
            </h1>
            <p>
              Everyone our servers have seen. Whoever is on a server right now
              comes first.
            </p>
            <Who
              chosen={draft.suspect}
              choose={(suspect) => set({ suspect })}
            />
          </>
        )}
        {draft.step === 2 && (
          <>
            <h1>
              THE <em>EVIDENCE.</em>
            </h1>
            <Evidence config={config} draft={draft} set={set} />
          </>
        )}
        {draft.step === 3 && type && (
          <>
            <h1>
              THE <em>DETAILS.</em>
            </h1>
            <div className="field">
              <span className="label">Which server (optional)</span>
              <Choice
                options={config.servers.map((s) => s.name)}
                many={false}
                value={config.servers.find((s) => s.id === draft.server)?.name}
                onChange={(name) =>
                  set({
                    server:
                      config.servers.find((s) => s.name === name)?.id ?? null,
                  })
                }
              />
            </div>
            <div className="field">
              <span className="label">
                When, by this PC's clock (optional, the last{" "}
                {limits.window_days} days)
              </span>
              <input
                className="input when"
                type="datetime-local"
                value={draft.when}
                max={localStamp(now)}
                min={localStamp(
                  new Date(now.getTime() - limits.window_days * 86400000),
                )}
                onChange={(e) => set({ when: e.target.value })}
              />
            </div>
            {type.questions.map((question) => (
              <Ask
                key={question.id}
                question={question}
                value={draft.answers[question.id]}
                onChange={(value) =>
                  set({ answers: { ...draft.answers, [question.id]: value } })
                }
              />
            ))}
            <div className="field">
              <span className="label">
                What happened ({length} of at least {limits.description_min})
              </span>
              <textarea
                className="input"
                rows={5}
                maxLength={limits.text_max}
                value={draft.description}
                placeholder="What you saw, in the order it happened."
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>
            <div className="field">
              <span className="label">Witnesses (optional)</span>
              <input
                className="input"
                maxLength={1000}
                value={draft.witnesses}
                placeholder="Anyone else who saw it."
                onChange={(e) => set({ witnesses: e.target.value })}
              />
            </div>
          </>
        )}
        {draft.step === 4 && type && draft.suspect && (
          <>
            <h1>
              CHECK <em>AND SEND.</em>
            </h1>
            <dl className="summary">
              <div>
                <dt>Report</dt>
                <dd>{type.label}</dd>
              </div>
              <div>
                <dt>Player</dt>
                <dd>
                  {draft.suspect.name}
                  <span className="small"> {draft.suspect.steam_id}</span>
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  {clips.length || draft.shots.length
                    ? [
                        clips.length &&
                          `${clips.length} clip link${clips.length > 1 ? "s" : ""}`,
                        draft.shots.length &&
                          `${draft.shots.length} screenshot${draft.shots.length > 1 ? "s" : ""}`,
                      ]
                        .filter(Boolean)
                        .join(", ")
                    : "None. The report will be logged, but we may not be able to act on it."}
                </dd>
              </div>
              <div>
                <dt>Where and when</dt>
                <dd>
                  {config.servers.find((s) => s.id === draft.server)?.name ||
                    "Server not given"}
                  {draft.when
                    ? `, ${new Date(draft.when).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>What happened</dt>
                <dd className="said">{draft.description.trim()}</dd>
              </div>
            </dl>
            <label className="tick">
              <input
                type="checkbox"
                checked={draft.consent}
                onChange={(e) => set({ consent: e.target.checked })}
              />
              <span>
                This report is true to the best of my knowledge. I understand
                TF21 staff will see it with my callsign, Discord and Steam
                account, and may message me about it.
              </span>
            </label>
          </>
        )}
        {error && <p className="notice">{error}</p>}
      </div>
      <div className="actions wizard-actions">
        <button
          type="button"
          className="button ghost"
          onClick={() => (draft.step ? set({ step: draft.step - 1 }) : leave())}
        >
          <ArrowLeft size={13} /> {draft.step ? "Back" : "Not now"}
        </button>
        {draft.step < STEPS.length - 1 ? (
          <button
            type="button"
            className="button"
            disabled={Boolean(missing)}
            onClick={() => set({ step: draft.step + 1 })}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="button"
            disabled={Boolean(missing) || busy}
            onClick={submit}
          >
            <Check size={13} /> {busy ? "Sending…" : "Send the report"}
          </button>
        )}
        {missing && <span className="small">{missing}</span>}
      </div>
    </section>
  );
}

export function Reports({
  state,
  go,
  slug,
}: {
  state: State;
  go: Go;
  /** The server the report was started from, on the Servers screen. */
  slug: string | null;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [error, setError] = useState("");
  const [writing, setWriting] = useState<Draft | null>(kept);
  const [sent, setSent] = useState("");
  const [copied, setCopied] = useState(false);
  const me = state.me;
  const ready = Boolean(me?.profile && me.steam.linked);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    api<Config>("/api/app/reports/config")
      .then((c) => alive && setConfig(c))
      .catch((e) => alive && setError(String(e)));
    api<{ reports: Mine[] }>("/api/app/reports/mine")
      .then((r) => alive && setMine(r.reports))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, sent]);
  // Started from a server's card: straight into the form, with that server filled in.
  useEffect(() => {
    if (!slug || !config || writing) return;
    const server = config.servers.find((s) => s.slug === slug);
    setWriting({ ...blank(), server: server?.id ?? null });
    go("report");
  }, [slug, config]);

  if (writing && config)
    return (
      <Wizard
        config={config}
        start={writing}
        leave={() => {
          kept = null;
          setWriting(null);
        }}
        done={(ref) => {
          setWriting(null);
          setSent(ref);
        }}
      />
    );
  return (
    <section>
      <span className="eyebrow">Keep the servers worth playing on</span>
      <h1>
        REPORT A <em>PLAYER.</em>
      </h1>
      <p className="lead">
        {config?.intro ||
          "Cheating, teamkilling, griefing, abuse: tell the staff team, with evidence, and they will deal with it. Reports are worked in order and you are told the outcome."}
      </p>
      {sent && (
        <div className="panel sent">
          <span className="eyebrow">
            <i className="dot live" /> Report received
          </span>
          <h2>
            Your report is <em className="gold">{sent}</em>
          </h2>
          <p className="small">
            It is with the TF21 staff team. You will be told when it is picked
            up and when there is an outcome, by the TF21 bot on Discord and on
            the report's own page.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button"
              onClick={() => open(`/report/${sent}`)}
            >
              Open the report <ExternalLink size={12} />
            </button>
            <button
              type="button"
              className="text"
              onClick={() =>
                navigator.clipboard.writeText(sent).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? "Copied" : "Copy the reference"}
            </button>
          </div>
        </div>
      )}
      {!me?.profile ? (
        <div className="impact">
          Reports come from members, so staff know who is behind each one.{" "}
          <button
            type="button"
            className="text inline"
            onClick={() => go("settings")}
          >
            Sign in
          </button>{" "}
          to report a player.
        </div>
      ) : !me.steam.linked ? (
        <div className="impact">
          Link your Steam account on tf21.net first: it ties your report to your
          in-game identity.{" "}
          <button
            type="button"
            className="text inline"
            onClick={() => open("/link/steam")}
          >
            Link Steam <ExternalLink size={10} />
          </button>
        </div>
      ) : error ? (
        <p className="notice">{error}</p>
      ) : config && !config.enabled ? (
        <div className="impact">Player reports are closed right now.</div>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="button"
            disabled={!config}
            onClick={() => {
              setSent("");
              setWriting(blank());
            }}
          >
            <Flag size={13} /> Start a report
          </button>
          <span className="small">
            Five short steps. A clip is what lets us act.
          </span>
        </div>
      )}
      {mine && mine.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Your reports</h2>
              <p className="small">
                The conversation with staff is on each report's own page.
              </p>
            </div>
          </div>
          <ul className="rows">
            {mine.map((r) => (
              <li
                key={r.ref}
                className={`clickable ${r.unread ? "unread" : ""}`}
                onClick={() => open(`/report/${r.ref}`)}
              >
                <span className="meta">
                  <span>{r.ref}</span>
                  <span>{ago(r.created_at)}</span>
                  <span className={`state ${r.status}`}>
                    {r.status === "closed" && r.outcome
                      ? OUTCOME[r.outcome] || STATUS.closed
                      : STATUS[r.status]}
                  </span>
                  {r.unread && <span className="state new">New reply</span>}
                </span>
                <b>{r.suspect_name}</b>
                <p>
                  {config?.types.find((t) => t.id === r.type)?.label || r.type}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
