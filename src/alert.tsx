import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./app.css";
import { invoke, useWarden, type Notification } from "./bridge";

// What the join is doing, in the order it does it.
const STEPS: [string, string][] = [
  ["launching", "Launching WARDOGS"],
  ["window", "Waiting for the game to open"],
  ["menu", "Getting past the title screen"],
  ["deploy", "Opening Deploy"],
  ["community", "Opening the community servers"],
  ["join_by_id", "Opening Join by ID"],
  ["server_id", "Entering the Server ID"],
  ["lookup", "Looking up the server"],
  ["joining", "Joining the match"],
  ["joined", "On the server"],
];
const QUEUED = "In the server queue";
const NOTICE_SECONDS = 25;
const decide = (action: string) => invoke("decide", { action });
const dismiss = (open: boolean) => invoke("dismiss_notice", { open });

// A pushed notification: it waits to be read, then puts itself away. It stays in the inbox.
function Notice({ notice, site }: { notice: Notification; site: string }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(false), NOTICE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [notice.id]);
  return (
    <div
      className="card notice-card"
      role="alertdialog"
      aria-label="Notification"
    >
      <span className="eyebrow">
        <i className="dot live" />
        {notice.kind}
      </span>
      <h1 className="doing">{notice.title}</h1>
      {notice.image && (
        <img
          src={
            notice.image.startsWith("/") ? site + notice.image : notice.image
          }
          alt=""
        />
      )}
      {notice.body && <p className="said">{notice.body}</p>}
      <div className="progress" aria-hidden="true">
        <i
          key={notice.id}
          className="draining"
          style={{ animationDuration: `${NOTICE_SECONDS}s` }}
        />
      </div>
      <div className="actions">
        <button className="button" onClick={() => dismiss(true)}>
          {notice.kind === "update"
            ? "See what's new"
            : notice.url
              ? "Open"
              : "Open inbox"}
        </button>
        <button className="text" onClick={() => dismiss(false)}>
          {notice.kind === "update" ? "Later" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

// The always-on-top card: the countdown before a join, the join itself step by step, and the
// countdown before the game is closed again.
function Alert() {
  const state = useWarden();
  if (!state) return null;
  const { phase, server, seconds, step, test } = state.seed;
  if (state.notice && !["countdown", "launching", "closing"].includes(phase))
    return <Notice notice={state.notice} site={state.site} />;
  const name = server?.name || "the server";
  const queued = step === "queued";
  const done = queued || step === "joined";
  const at = queued
    ? STEPS.length - 1
    : Math.max(
        0,
        STEPS.findIndex(([id]) => id === step),
      );
  const doing = queued ? QUEUED : STEPS[at][1];
  return (
    <div className="card" role="alertdialog" aria-label="Seed call">
      {phase === "countdown" && (
        <>
          <span className="eyebrow">
            <i className="dot live" />
            Seed call
          </span>
          <b className="count gold">{seconds}</b>
          <h1>
            JOINING <em>IN {seconds}s.</em>
          </h1>
          <p className="small" title={name}>
            {name}
          </p>
          <div className="actions">
            <button className="button" onClick={() => decide("join")}>
              Join now
            </button>
            <button className="button ghost" onClick={() => decide("snooze")}>
              Snooze 1h
            </button>
            <button className="text" onClick={() => decide("cancel")}>
              Cancel
            </button>
          </div>
        </>
      )}
      {phase === "launching" && (
        <>
          <span className="eyebrow">
            <i className="dot live" />
            {test ? "Joining" : "Seed call"} · step {at + 1} of {STEPS.length}
          </span>
          <h1 className="doing" role="status">
            {done ? <em>{doing}.</em> : <>{doing}…</>}
          </h1>
          <div
            className={`progress ${done ? "" : "working"}`}
            aria-hidden="true"
          >
            <i style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="small" title={name}>
            {done ? name : `${name} · keep your hands off the mouse`}
          </p>
          {!done && (
            <div className="actions">
              <button className="button ghost" onClick={() => decide("stop")}>
                Stop
              </button>
            </div>
          )}
        </>
      )}
      {phase === "closing" && (
        <>
          <span className="eyebrow">
            <i className="dot live" />
            Seeding complete
          </span>
          <b className="count gold">{seconds}</b>
          <h1>
            CLOSING <em>IN {seconds}s.</em>
          </h1>
          <p className="small">Thank you. WARDOGS closes unless you stay.</p>
          <div className="actions">
            <button className="button" onClick={() => decide("stay")}>
              Stay in the game
            </button>
            <button className="text" onClick={() => decide("close")}>
              Close now
            </button>
          </div>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Alert />
  </StrictMode>,
);
