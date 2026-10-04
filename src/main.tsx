import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Bell,
  Crosshair,
  Download,
  Flag,
  Home as HomeIcon,
  ListOrdered,
  Minus,
  Newspaper,
  Radio,
  Server,
  Settings as Cog,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./app.css";
import mark from "./mark.svg";
import { api, invoke, listen, useWarden, type Notification } from "./bridge";
import { Home, Inbox, News, Seeding, Settings } from "./screens";
import { Servers } from "./servers";
import { Reports } from "./report";
import { Consent } from "./terms";
import { Changelog, Competitions, Leaderboards, Record, Update } from "./more";

const TABS = [
  ["home", "Home", HomeIcon],
  ["servers", "Servers", Server],
  ["record", "My record", Crosshair],
  ["competitions", "Competitions", Trophy],
  ["leaderboards", "Leaderboards", ListOrdered],
  ["news", "News", Newspaper],
  ["seeding", "Seeding", Radio],
  ["report", "Report a player", Flag],
  ["inbox", "Inbox", Bell],
  // Only there while a newer version is out.
  ["update", "Update", Download],
  ["changelog", "What's new", Sparkles],
  ["settings", "Settings", Cog],
] as const;
export type Tab = (typeof TABS)[number][0];

const shell = "__TAURI_INTERNALS__" in window;
const windowDo = (what: "minimize" | "hide") =>
  shell && void getCurrentWindow()[what]();

function App() {
  const state = useWarden();
  const [tab, setTab] = useState<Tab>("home");
  const [article, setArticle] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [inbox, setInbox] = useState<Notification[]>([]);
  const loadInbox = () =>
    api<{ items: Notification[] }>("/api/app/feed")
      .then((r) => setInbox(r?.items || []))
      .catch(() => {});
  useEffect(() => {
    if (!state?.online) return;
    void loadInbox();
    const stop = listen("notify", loadInbox);
    return () => void stop.then((off) => off());
  }, [state?.online]);
  useEffect(() => {
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    // The button on the popup card lands here.
    const stop = listen("goto", (payload) => {
      const n = payload as Notification;
      if (n.kind === "update") return go("update");
      void api(`/api/app/feed/${n.id}/open`, "POST", {})
        .catch(() => {})
        .then(loadInbox);
      const blog = /^\/blog\/([a-z0-9-]+)$/.exec(n.url);
      if (blog) go("news", blog[1]);
      else if (n.url) void invoke("open_url", { url: n.url });
      else go("inbox");
    });
    return () => void stop.then((off) => off());
  }, []);
  if (!state) return null;

  const go = (next: Tab, slug: string | null = null) => {
    setArticle(slug);
    setTab(next);
  };
  const unread = inbox.filter((n) => !n.opened).length;
  // What stands between the user and the app: the update check and a critical update first,
  // then the terms.
  const gate =
    state.boot.status !== "clear" || state.update?.critical
      ? "update"
      : state.consent.needed
        ? "terms"
        : null;
  const me = state.me;
  return (
    <div className="shell">
      <span className="frame" aria-hidden="true" />
      <header className="bar" data-tauri-drag-region>
        <span className="brand">
          <img src={mark} alt="" />
          <span>
            TASK FORCE <b>21</b>
          </span>
          <small>WARDEN</small>
        </span>
        <span className="grow" data-tauri-drag-region />
        <span className="link-state" role="status">
          <i className={`dot ${state.online ? "live" : "hot"}`} />
          {gate ? "Not connected" : state.online ? "Connected" : "Reconnecting"}
        </span>
        <button
          type="button"
          className="win"
          aria-label="Minimise"
          onClick={() => windowDo("minimize")}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="win"
          aria-label="Close to tray"
          title="Close to tray"
          onClick={() => windowDo("hide")}
        >
          <X size={15} />
        </button>
      </header>
      <nav
        className="nav"
        aria-label="Sections"
        hidden={Boolean(gate) || reviewing}
      >
        {TABS.filter(([id]) => id !== "update" || state.update).map(
          ([id, label, Icon]) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "on" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={16} strokeWidth={1.7} />
              {label}
              {id === "inbox" && unread > 0 && <i>{unread}</i>}
              {id === "update" && <i>1</i>}
            </button>
          ),
        )}
        <div className="who">
          {me?.profile ? (
            <>
              Signed in
              <b>{me.profile.callsign}</b>
            </>
          ) : (
            <>
              Not signed in
              <button
                type="button"
                className="text"
                onClick={() => go("settings")}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </nav>
      {gate === "update" && (
        <main className="view gate">
          <Update state={state} />
        </main>
      )}
      {(gate === "terms" || (!gate && reviewing)) && (
        <main className="view gate">
          <Consent
            version={state.version}
            seedingAgreed={state.consent.seeding}
            review={
              state.consent.needed ? undefined : () => setReviewing(false)
            }
          />
        </main>
      )}
      <main className="view" hidden={Boolean(gate) || reviewing}>
        {tab === "record" && <Record state={state} go={go} />}
        {tab === "competitions" && <Competitions />}
        {tab === "leaderboards" && <Leaderboards />}
        {tab === "changelog" && <Changelog version={state.version} />}
        {tab === "update" &&
          (state.update ? (
            <Update state={state} />
          ) : (
            <Changelog version={state.version} />
          ))}
        {tab === "home" && <Home state={state} inbox={inbox} go={go} />}
        {tab === "servers" && <Servers state={state} go={go} />}
        {tab === "report" && <Reports state={state} go={go} slug={article} />}
        {tab === "news" && (
          <News
            article={article}
            open={(slug) => setArticle(slug)}
            site={state.site}
          />
        )}
        {tab === "seeding" && <Seeding state={state} go={go} />}
        {tab === "inbox" && (
          <Inbox items={inbox} reload={loadInbox} go={go} site={state.site} />
        )}
        {tab === "settings" && (
          <Settings state={state} terms={() => setReviewing(true)} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
