import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Play } from "lucide-react";
import {
  ago,
  api,
  invoke,
  REASONS,
  type DeviceSettings,
  type Notification,
  type State,
} from "./bridge";
import type { Tab } from "./main";
import { SeedingAgreement } from "./terms";

type Go = (tab: Tab, slug?: string | null) => void;
type ServerRow = {
  slug: string;
  name: string;
  status: {
    state: string;
    online: boolean;
    match?: { map: string; players: { current: number; max: number } };
    facts?: { region?: string };
    seeding?: { active: boolean };
  };
};
type Post = {
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  tags: string[];
  reading_minutes: number;
  published_at: string;
  content_html?: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KINDS: [string, string, string][] = [
  ["announcement", "Announcements", "Messages from TF21 staff."],
  ["news", "News", "A new dispatch on the blog."],
  [
    "event",
    "Events and competitions",
    "Operations and competitions starting or opening.",
  ],
  [
    "server",
    "Server status",
    "A server going live, filling or coming back up.",
  ],
  ["personal", "Personal", "Replies and rewards meant for you."],
  ["seed", "Seed calls", "The heads-up before WARDEN joins a server for you."],
];
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const open = (url: string) => invoke("open_url", { url });
// The app's source, published so anyone can check what it does.
const SOURCE = "https://github.com/PVRAMID/tf21-warden";

/** Reads a website path now and again every `ms`; keeps the last good answer. */
function useRead<T>(path: string | null, ms = 0) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const read = () =>
      api<T>(path)
        .then((r) => alive && r && setData(r))
        .catch(() => {});
    void read();
    const timer = ms ? setInterval(read, ms) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, ms]);
  return data;
}

function Panel({
  numeral,
  title,
  hint,
  aside,
  children,
  className = "",
}: {
  numeral?: string;
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel ${className}`}>
      <div className="panel-head">
        {numeral && (
          <span className="numeral" aria-hidden="true">
            {numeral}
          </span>
        )}
        <div>
          <h2>{title}</h2>
          {hint && <p className="small">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden="true" />
      <span>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
    </label>
  );
}

function ServerCard({ server, state }: { server: ServerRow; state: State }) {
  const [error, setError] = useState("");
  // Set when nobody on the server could be joined through Steam: the ID to join by hand.
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const match = server.status.match;
  const players = match?.players;
  const join = () => {
    setError("");
    setCode(null);
    invoke<{ opened: boolean; code: string | null }>("join_link", {
      slug: server.slug,
    })
      .then((r) => {
        if (!r.opened) setCode(r.code || "");
      })
      .catch((e) => setError(String(e)));
  };
  return (
    <div className="panel server">
      <span className="eyebrow">
        <i className={`dot ${server.status.online ? "live" : "hot"}`} />
        {server.status.online
          ? server.status.seeding?.active
            ? "Seeding now"
            : "Live"
          : "Offline"}
      </span>
      <h2 title={server.name}>{server.name}</h2>
      <div className="count">
        <span className={players ? "gold" : ""}>{players?.current ?? "—"}</span>
        <em>/ {players?.max ?? "—"}</em>
      </div>
      <div className="fill" aria-hidden="true">
        <i
          style={{
            width: `${players ? (players.current / players.max) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="facts">
        <span>
          Map <b>{match?.map || "—"}</b>
        </span>
        {server.status.facts?.region && (
          <span>
            Region <b>{server.status.facts.region}</b>
          </span>
        )}
      </div>
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

export function Servers({ state }: { state: State }) {
  const data = useRead<{ servers: ServerRow[] }>("/api/servers", 15000);
  return (
    <section>
      <span className="eyebrow">The servers</span>
      <h1>
        PICK A <em>FIGHT.</em>
      </h1>
      <p className="lead">
        Join hands Steam a link to somebody already on the server, and Steam
        takes you in. WARDEN does not touch your mouse or keyboard for it.
      </p>
      <div className="servers">
        {data?.servers.map((s) => (
          <ServerCard key={s.slug} server={s} state={state} />
        ))}
      </div>
    </section>
  );
}

export function Home({
  state,
  inbox,
  go,
}: {
  state: State;
  inbox: Notification[];
  go: Go;
}) {
  const servers = useRead<{ servers: ServerRow[] }>("/api/servers", 15000);
  const news = useRead<{ items: Post[] }>("/api/blog?per_page=3");
  const online =
    servers?.servers.reduce(
      (n, s) => n + (s.status.match?.players.current || 0),
      0,
    ) ?? null;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <section>
      <div className="mast">
        <span className="watermark" aria-hidden="true">
          TF21
        </span>
        <div>
          <span className="eyebrow">
            {greeting}
            {state.me?.profile ? `, ${state.me.profile.callsign}` : ""}
          </span>
          <h1>
            ON <em>WATCH.</em>
          </h1>
          <span className={`status ${state.available ? "live" : ""}`}>
            <i className={`dot ${state.available ? "live" : ""}`} />
            {REASONS[state.reason] || state.reason}
          </span>
        </div>
        <div className="mast-live">
          <b className="gold">{online ?? "—"}</b>
          <span className="label">Players on our servers</span>
        </div>
      </div>
      <div className="servers">
        {servers?.servers.map((s) => (
          <ServerCard key={s.slug} server={s} state={state} />
        ))}
      </div>
      <div className="cols">
        <Panel
          title="Latest news"
          aside={
            <button type="button" className="text" onClick={() => go("news")}>
              All news
            </button>
          }
        >
          <ul className="rows">
            {news?.items.map((p) => (
              <li
                key={p.slug}
                className="clickable"
                onClick={() => go("news", p.slug)}
              >
                <b>{p.title}</b>
                <span className="meta">
                  <span>{day(p.published_at)}</span>
                  <span>{p.reading_minutes} min read</span>
                </span>
              </li>
            ))}
            {news && !news.items.length && (
              <li className="empty">No dispatches yet.</li>
            )}
          </ul>
        </Panel>
        <Panel
          title="Inbox"
          aside={
            <button type="button" className="text" onClick={() => go("inbox")}>
              Open inbox
            </button>
          }
        >
          <ul className="rows">
            {inbox.slice(0, 3).map((n) => (
              <li key={n.id} className={n.opened ? "" : "unread"}>
                <b>{n.title}</b>
                <span className="meta">
                  <span>{ago(n.created_at)}</span>
                  <span>{n.kind}</span>
                </span>
              </li>
            ))}
            {!inbox.length && <li className="empty">Nothing yet.</li>}
          </ul>
        </Panel>
      </div>
    </section>
  );
}

export function News({
  article,
  open: show,
  site,
}: {
  article: string | null;
  open: (slug: string | null) => void;
  site: string;
}) {
  const list = useRead<{ items: Post[] }>("/api/blog?per_page=20");
  const post = useRead<Post>(article ? `/api/blog/${article}` : null);
  if (article)
    return (
      <section className="article">
        <div className="actions">
          <button type="button" className="text" onClick={() => show(null)}>
            <ArrowLeft size={11} /> All news
          </button>
          <button
            type="button"
            className="text"
            onClick={() => open(`/blog/${article}`)}
          >
            Open on tf21.net <ExternalLink size={11} />
          </button>
        </div>
        {post?.slug === article && (
          <>
            <span className="meta">
              <span>{day(post.published_at)}</span>
              <span>{post.reading_minutes} min read</span>
            </span>
            <h1 style={{ fontSize: 44 }}>{post.title}</h1>
            {/* Staff-written HTML from the website's own blog; the app's CSP blocks any script in it. */}
            <div
              className="prose"
              // A link in a dispatch opens in the browser, never inside the app.
              onClick={(e) => {
                const link = (e.target as HTMLElement).closest("a");
                if (!link) return;
                e.preventDefault();
                open(link.getAttribute("href") || "");
              }}
              dangerouslySetInnerHTML={{
                // Pictures in a dispatch are addressed relative to the website.
                __html: (post.content_html || "").replaceAll(
                  'src="/',
                  `src="${site}/`,
                ),
              }}
            />
          </>
        )}
      </section>
    );
  return (
    <section>
      <span className="eyebrow">Dispatches</span>
      <h1>
        THE <em>NEWS.</em>
      </h1>
      <ul className="rows">
        {list?.items.map((p) => (
          <li key={p.slug} className="clickable" onClick={() => show(p.slug)}>
            <span className="meta">
              <span>{day(p.published_at)}</span>
              <span>{p.reading_minutes} min read</span>
              {p.tags.slice(0, 3).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </span>
            <b>{p.title}</b>
            <p>{p.excerpt}</p>
          </li>
        ))}
        {list && !list.items.length && (
          <li className="empty">No dispatches yet.</li>
        )}
      </ul>
    </section>
  );
}

export function Inbox({
  items,
  reload,
  go,
  site,
}: {
  items: Notification[];
  reload: () => void;
  go: Go;
  site: string;
}) {
  // Clearing only tidies this PC's inbox.
  const clear = (id?: number) =>
    api(id ? `/api/app/feed/${id}/clear` : "/api/app/feed/clear", "POST", {})
      .catch(() => {})
      .then(reload);
  const read = async (n: Notification) => {
    if (!n.opened) {
      await api(`/api/app/feed/${n.id}/open`, "POST", {}).catch(() => {});
      reload();
    }
    const blog = /^\/blog\/([a-z0-9-]+)$/.exec(n.url);
    if (blog) go("news", blog[1]);
    else if (n.url) void open(n.url);
  };
  return (
    <section>
      <span className="eyebrow">From TF21</span>
      <h1>
        YOUR <em>INBOX.</em>
      </h1>
      {items.length > 0 && (
        <div className="actions">
          <button type="button" className="text" onClick={() => void clear()}>
            Clear all
          </button>
        </div>
      )}
      <ul className="rows">
        {items.map((n) => (
          <li
            key={n.id}
            className={`clickable ${n.opened ? "" : "unread"}`}
            onClick={() => void read(n)}
          >
            <span className="meta">
              <span>{ago(n.created_at)}</span>
              <span>{n.kind}</span>
              {!n.opened && <span>New</span>}
              <button
                type="button"
                className="text clear"
                aria-label={`Clear ${n.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void clear(n.id);
                }}
              >
                Clear
              </button>
            </span>
            <b>{n.title}</b>
            {n.body && <p>{n.body}</p>}
            {n.image && (
              <img
                className="pictured"
                src={n.image.startsWith("/") ? site + n.image : n.image}
                alt=""
              />
            )}
          </li>
        ))}
        {!items.length && (
          <li className="empty">
            Announcements and alerts from TF21 will land here.
          </li>
        )}
      </ul>
    </section>
  );
}

/** Saves the install's settings on the website, then has the core read them back. */
function useSettings(state: State) {
  const [error, setError] = useState("");
  const settings = state.me?.settings;
  const save = (next: DeviceSettings) =>
    api("/api/app/settings", "PUT", next)
      .then(() => invoke("refresh"))
      .then(() => setError(""))
      .catch((e) => setError(String(e)));
  return { settings, save, error };
}

export function Seeding({ state, go }: { state: State; go: Go }) {
  const { settings, save, error } = useSettings(state);
  const [failed, setFailed] = useState("");
  const me = state.me;
  if (!me || !settings) return null;
  const auto = settings.autoseed;
  const set = (patch: Partial<typeof auto>) =>
    save({ ...settings, autoseed: { ...auto, ...patch } });
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const agreed = state.consent.seeding;
  const locked = !agreed || !me.profile || !me.steam.linked;
  const bonus = me.bonus;
  return (
    <section>
      <span className="eyebrow">
        <i className={`dot ${state.available ? "live" : ""}`} />
        {REASONS[state.reason] || state.reason}
      </span>
      <h1>
        SEED WHILE <em>YOU ARE AWAY.</em>
      </h1>
      <p className="lead">
        A full server starts with a few people on an empty one. Opt in and
        WARDEN answers seed calls for you: it launches WARDOGS, joins the
        server, and closes the game again when the server is seeded.
      </p>
      {!me.profile ? (
        <div className="impact">
          Automatic seeding needs to know who you are.{" "}
          <button type="button" className="text" onClick={() => go("settings")}>
            Sign in
          </button>
        </div>
      ) : !me.steam.linked ? (
        <div className="impact">
          Link your Steam account on tf21.net so the server can recognise you.{" "}
          <button
            type="button"
            className="text"
            onClick={() => open("/link/steam")}
          >
            Link Steam <ExternalLink size={11} />
          </button>
        </div>
      ) : null}
      {(error || failed) && <p className="notice">{error || failed}</p>}
      {!agreed && <SeedingAgreement />}
      <Switch
        checked={auto.enabled && !locked}
        disabled={locked}
        onChange={(enabled) => set({ enabled })}
        title="Automatic seeding"
        hint="Off until you switch it on. You always get a countdown first, and can cancel or snooze it."
      />
      <div className="cols">
        <Panel
          numeral="01"
          title="When"
          hint="By this PC's clock. A window that ends before it starts runs overnight."
        >
          <div className="field">
            <span className="label">Days</span>
            <div className="chips">
              {DAYS.map((name, i) => (
                <button
                  type="button"
                  key={name}
                  className={`chip ${auto.days.includes(i) ? "on" : ""}`}
                  aria-pressed={auto.days.includes(i)}
                  onClick={() => set({ days: toggle(auto.days, i).sort() })}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="actions">
            <label className="field">
              <span className="label">From</span>
              <input
                type="time"
                value={auto.from}
                onChange={(e) =>
                  e.target.value && set({ from: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="label">Until</span>
              <input
                type="time"
                value={auto.to}
                onChange={(e) => e.target.value && set({ to: e.target.value })}
              />
            </label>
          </div>
        </Panel>
        <Panel
          numeral="02"
          title="Where"
          hint="Which servers WARDEN may join for you."
        >
          <div className="chips">
            <button
              type="button"
              className={`chip ${auto.servers.length ? "" : "on"}`}
              aria-pressed={!auto.servers.length}
              onClick={() => set({ servers: [] })}
            >
              Any server
            </button>
            {me.servers.map((s) => (
              <button
                type="button"
                key={s.slug}
                className={`chip ${auto.servers.includes(s.slug) ? "on" : ""}`}
                aria-pressed={auto.servers.includes(s.slug)}
                title={s.name}
                onClick={() => set({ servers: toggle(auto.servers, s.slug) })}
              >
                Server #{s.number}
              </button>
            ))}
          </div>
          <p className="small">
            WARDEN never joins while another game or a full-screen app is
            running, or while WARDOGS is already open.
          </p>
        </Panel>
      </div>
      {bonus.enabled && (
        <p className="impact">
          Answering a call earns <b>{bonus.call_coins} Tascoin</b>, plus{" "}
          <b>
            {bonus.minute_coins} every {bonus.per_minutes} minutes
          </b>{" "}
          on the server
          {bonus.weekly_coins > 0 && (
            <>
              , and <b>{bonus.weekly_coins}</b> more for {bonus.weekly_calls}{" "}
              calls in a week
            </>
          )}
          . All on top of the normal seeding rate.
        </p>
      )}
      <Panel
        numeral="03"
        title="Try it"
        hint="Run the join once while you watch, to be sure it works on this PC. It needs the game at a 16:9 resolution."
      >
        <div className="actions">
          {me.servers.map((s) => (
            <button
              type="button"
              key={s.slug}
              className="button ghost"
              disabled={
                state.seed.phase !== "idle" || !state.game_installed || !agreed
              }
              onClick={() => {
                setFailed("");
                invoke("test_join", { slug: s.slug }).catch((e) =>
                  setFailed(String(e)),
                );
              }}
            >
              <Play size={13} /> Test on server #{s.number}
            </button>
          ))}
        </div>
      </Panel>
    </section>
  );
}

export function Settings({
  state,
  terms,
}: {
  state: State;
  terms: () => void;
}) {
  const { settings, save, error } = useSettings(state);
  const [linking, setLinking] = useState(false);
  // The number to type on the website's sign-in page.
  const [check, setCheck] = useState("");
  const [failed, setFailed] = useState("");
  const me = state.me;
  useEffect(() => {
    if (me?.profile) setLinking(false);
  }, [me?.profile]);
  if (!me || !settings)
    return (
      <section>
        <h1>
          NO <em>SIGNAL.</em>
        </h1>
        <p className="lead">
          WARDEN cannot reach tf21.net. It keeps trying on its own.
        </p>
      </section>
    );
  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  return (
    <section>
      <span className="eyebrow">This install</span>
      <h1>
        YOUR <em>SETTINGS.</em>
      </h1>
      {(error || failed) && <p className="notice">{error || failed}</p>}
      <div className="cols">
        <Panel
          title="Account"
          hint={
            me.profile
              ? `Signed in as ${me.profile.callsign}${me.steam.linked ? `, Steam ${me.steam.name || "linked"}` : ", no Steam account linked"}.`
              : "Sign in with your tf21.net account. It opens in your browser; WARDEN never sees a password."
          }
        >
          <div className="actions">
            {me.profile ? (
              <button
                type="button"
                className="button ghost"
                onClick={() =>
                  api("/api/app/link", "DELETE")
                    .then(() => invoke("refresh"))
                    .catch((e) => setFailed(String(e)))
                }
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setLinking(true);
                  setCheck("");
                  invoke<{ check: string }>("link")
                    .then((made) => setCheck(made.check))
                    .catch((e) => {
                      setLinking(false);
                      setFailed(String(e));
                    });
                }}
              >
                Sign in
              </button>
            )}
          </div>
          {linking && (
            <div className="impact signin-check">
              Your browser has opened tf21.net. Type this number there to finish
              signing in:
              <b aria-label="Sign-in number">
                {check ? `${check.slice(0, 3)} ${check.slice(3)}` : "··· ···"}
              </b>
              <span className="small">
                Never give this number to anyone. It is only for the page your
                own WARDEN just opened.
              </span>
            </div>
          )}
        </Panel>
        <Panel
          title="This PC"
          hint={`WARDEN ${state.version}. Updates are never installed without you: when one is out, the Update page shows what it changes.`}
        >
          <Switch
            checked={state.autostart}
            onChange={(enabled) =>
              invoke("set_autostart", { enabled }).catch((e) =>
                setFailed(String(e)),
              )
            }
            title="Start with Windows"
            hint="Opens quietly in the tray when you sign in to Windows."
          />
          <Switch
            checked={state.paused}
            onChange={(paused) => invoke("set_paused", { paused })}
            title="Pause seeding"
            hint="Ignore every seed call on this PC until you switch this off."
          />
          <div className="actions">
            {state.update && (
              <button
                type="button"
                className="button"
                onClick={() =>
                  invoke("install_update").catch((e) => setFailed(String(e)))
                }
              >
                Update to {state.update.version} and restart
              </button>
            )}
            <button
              type="button"
              className="text"
              onClick={() => invoke("quit")}
            >
              Quit WARDEN
            </button>
            <button type="button" className="text" onClick={terms}>
              Terms and privacy
            </button>
            <button type="button" className="text" onClick={() => open(SOURCE)}>
              View the source <ExternalLink size={11} />
            </button>
          </div>
        </Panel>
      </div>
      <Panel
        title="Notifications"
        hint="What pops up on your desktop. Everything still lands in the inbox."
      >
        <Switch
          checked={settings.sound}
          onChange={(sound) => save({ ...settings, sound })}
          title="Notification sounds"
          hint="Let urgent notifications play a chime. Off: they still pop up, silently."
        />
        <div className="cols">
          {KINDS.map(([kind, title, hint]) => (
            <Switch
              key={kind}
              checked={!settings.mutes.includes(kind)}
              onChange={() =>
                save({ ...settings, mutes: toggle(settings.mutes, kind) })
              }
              title={title}
              hint={hint}
            />
          ))}
        </div>
        <div className="field">
          <span className="label">Server alerts for</span>
          <div className="chips">
            <button
              type="button"
              className={`chip ${settings.follows.length ? "" : "on"}`}
              aria-pressed={!settings.follows.length}
              onClick={() => save({ ...settings, follows: [] })}
            >
              Every server
            </button>
            {me.servers.map((s) => (
              <button
                type="button"
                key={s.slug}
                className={`chip ${settings.follows.includes(s.slug) ? "on" : ""}`}
                aria-pressed={settings.follows.includes(s.slug)}
                title={s.name}
                onClick={() =>
                  save({
                    ...settings,
                    follows: toggle(settings.follows, s.slug),
                  })
                }
              >
                Server #{s.number}
              </button>
            ))}
          </div>
        </div>
      </Panel>
    </section>
  );
}
