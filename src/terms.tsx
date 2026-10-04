import { useState, type ReactNode } from "react";
import {
  Ban,
  Eye,
  FileCheck2,
  MousePointerClick,
  Send,
  ShieldOff,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { invoke } from "./bridge";

// The terms a new install, and every new version, is taken through one step at a time before
// the app sends anything. Every statement here describes what the code does; change one only
// with the other, and keep the website's privacy policy (src/legal.tsx, "warden") in step.

const DOES = [
  "Sits in your system tray and starts with Windows. You can switch that off in Settings, and quit from the tray at any time.",
  "Connects to tf21.net, and only tf21.net, over an encrypted connection, and keeps that connection open so notifications and seed calls arrive at once.",
  "Shows you TF21 announcements, news, server status, competitions, leaderboards and, once you sign in, your own record.",
  "Checks tf21.net for a newer version when it starts, before anything else, and while it runs. It tells you when there is one and shows you what it changes, and installs it only when you say so. The one exception is an update TF21 marks as critical, for security or because the old version can no longer work with tf21.net: until that is installed the app shuts itself off, and you can update or uninstall. Every update is signed by TF21, and after every update these terms are shown to you again.",
];
const SEES = [
  "Whether WARDOGS is installed, by reading Steam's own list of installed games, and whether WARDOGS is running.",
  "Which Steam account is signed in on this PC (its SteamID64, a public number), so the server can recognise you when you join.",
  "Whether a game, a full-screen app or a presentation has the screen. Windows answers yes or no; WARDEN is never told which app it is.",
  "This PC's name and its clock, to label your install and to keep to the hours you choose.",
];
const SENDS = [
  "A random ID and key created for this install, the name of this PC, and the app's version.",
  "That you accepted these terms: for which version, when, and whether you agreed to automatic seeding. TF21 keeps that record.",
  "The SteamID64 signed in to Steam on this PC.",
  "Your settings in this app: seeding hours and servers, which notifications you muted.",
  "Every 30 seconds, whether this PC could answer a seed call right now and a one-word reason if not, such as “off”, “hours”, “in_game” or “busy”.",
  "Your answer to a seed call (joined, declined, cancelled or failed), and whether you opened or cleared a notification.",
  "If you sign in: the link between this install and your TF21 profile. Signing in happens in your browser, confirmed with a number only this app shows you; WARDEN never sees a password.",
  "If you report a player from the app: the report itself (who, what, where and when, your description and any clip links) and any screenshots you pick to attach. It goes to the TF21 staff team with your callsign, Discord and Steam account, exactly as a report made on tf21.net does. Looking a player up sends what you type in the search box.",
  "Like any website you visit, tf21.net sees your IP address.",
];
const NEVER = [
  "Read, open or upload your files, documents, photos or downloads. The one exception is a screenshot you pick yourself to attach to a player report.",
  "Read your browser, your history, your passwords, your messages or your emails.",
  "Record what you type. It has no key logger and does not watch your keyboard or mouse.",
  "Take pictures of your desktop or of any window other than WARDOGS, or use your camera or microphone.",
  "Run with administrator rights, install drivers or services, or change Windows settings other than its own start-up entry.",
  "Run commands sent by TF21. The website can only send it a notification (or the removal of one), a seed call for a TF21 server, word that a call has ended, that your sign-in changed, and that a new version exists.",
  "Touch any game or program other than WARDOGS, or play the game for you.",
  "Sell or share what it sends. It carries no adverts and no third-party trackers.",
];
const SEEDING = [
  "Start WARDOGS through Steam when TF21 calls for seeders, during the days and hours you set, on the servers you choose.",
  "Always show a countdown first, of at least 15 seconds, which you can cancel or snooze. It will not start while another game or a full-screen app is running, or while WARDOGS is already open.",
  "Bring the game to the front and take control of your mouse and keyboard for the few seconds it takes to work the menus: it presses a key on the title screen, clicks Deploy, Community and Join by ID, pastes the server's ID and clicks Join Match. If you are using the PC at that moment, your pointer will move. It clicks and types only while WARDOGS is the window in front, so nothing is sent to another program.",
  "Use your clipboard to paste the server's ID, then put back the text that was there.",
  "Read the WARDOGS window, and only that window, to know which menu is showing. The pictures are read on your PC by Windows' own text recognition and thrown away at once. They are never saved and never leave your PC.",
  "Close WARDOGS when seeding is over, after a countdown you can stop by choosing to stay. It only ever closes a game it started itself.",
  "Leave your PC in a WARDOGS server, connected and using your connection and electricity, for as long as the seed call lasts.",
];

function List({ items }: { items: string[] }) {
  return (
    <ul className="terms-list">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

function Tick({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="tick">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function SeedingText() {
  return (
    <>
      <p>
        Automatic seeding is optional and separate from everything else in
        WARDEN. It is the only part of the app that controls anything on your
        PC, so it has its own agreement. If you agree, and then switch it on in
        the Seeding tab, WARDEN will:
      </p>
      <List items={SEEDING} />
      <p>
        These abilities are used only for automatic seeding and for the Test
        auto-join button beside it. The Join buttons elsewhere in the app just
        hand Steam a join link. Without this agreement automatic seeding stays
        switched off and everything else works as normal. You can agree later,
        or withdraw by switching automatic seeding off or pausing it from the
        tray.
      </p>
      <p>
        Your seeding choice is kept on this PC. Whether automatic seeding is on,
        and for which servers and hours, is stored by the app itself; tf21.net
        is sent a copy so it knows whom to ask. The website cannot switch
        seeding on for you, change your hours or servers, or shorten the
        countdown below 15 seconds.
      </p>
      <p>
        WARDOGS has its own anti-cheat. WARDEN does not read or change the
        game's memory or files, puts nothing inside the game and passes it no
        launch options: it starts it through Steam, as the Play button does, and
        presses menu buttons with ordinary simulated mouse and keyboard input,
        never once you are in a match. None of that is what anti-cheat is there
        to catch, but TF21 does not make the game or its anti-cheat and cannot
        make promises on its developers' behalf. If that worries you, leave
        automatic seeding off: the rest of WARDEN only ever hands Steam a join
        link.
      </p>
      <p>
        WARDEN works the game's menus, not the game. It gives you no advantage
        in a match. It is made by Task Force 21, a player community, and is not
        made or endorsed by the developers of WARDOGS.
      </p>
    </>
  );
}

const CONTROL =
  "I understand that WARDEN will launch WARDOGS and take control of my mouse and keyboard for a few seconds to join a server, and will close the game it launched when seeding is over.";
const WINDOW =
  "I understand that WARDEN reads the WARDOGS window, and nothing else on my screen, to do that.";

/** The seeding agreement on its own, for somebody who declined it at first. */
export function SeedingAgreement() {
  const [control, setControl] = useState(false);
  const [window, setWindow] = useState(false);
  return (
    <div className="panel terms">
      <h2>The automatic seeding agreement</h2>
      <SeedingText />
      <Tick checked={control} onChange={setControl}>
        {CONTROL}
      </Tick>
      <Tick checked={window} onChange={setWindow}>
        {WINDOW}
      </Tick>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!control || !window}
          onClick={() => invoke("set_consent", { seeding: true })}
        >
          I agree to automatic seeding
        </button>
      </div>
    </div>
  );
}

type Step = {
  id: string;
  label: string;
  icon: LucideIcon;
  title: ReactNode;
  body: ReactNode;
  /** What must be ticked on this step before moving on. */
  tick?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    label: "Welcome",
    icon: Sparkles,
    title: (
      <>
        BEFORE <em>WE START.</em>
      </>
    ),
    body: (
      <>
        <p className="lead">
          WARDEN is a small app with a few real abilities, and you should know
          exactly what they are before it does anything. The next six steps set
          them out in plain English. It takes about two minutes.
        </p>
        <p>
          Nothing is hidden behind a link: what you read here is everything the
          app does. You will be shown it again whenever the app updates, and you
          can read it at any time from Settings.
        </p>
      </>
    ),
  },
  {
    id: "does",
    label: "What it does",
    icon: FileCheck2,
    title: (
      <>
        WHAT WARDEN <em>DOES.</em>
      </>
    ),
    body: <List items={DOES} />,
  },
  {
    id: "sees",
    label: "What it sees",
    icon: Eye,
    title: (
      <>
        WHAT IT CAN SEE <em>ON THIS PC.</em>
      </>
    ),
    body: <List items={SEES} />,
    tick: "I understand what WARDEN does on my PC and what it can see, including that it starts with Windows and checks for updates.",
  },
  {
    id: "sends",
    label: "What it sends",
    icon: Send,
    title: (
      <>
        WHAT IT SENDS <em>TO TF21.NET.</em>
      </>
    ),
    body: (
      <>
        <List items={SENDS} />
        <p>
          TF21 keeps this against your install so the app works: to deliver
          notifications, to know who can answer a seed call, and to credit
          seeding. Staff with the right permission can see how many installs
          there are, who accepted these terms, who answered a seed call, and how
          many PCs received a notification. How TF21 handles personal
          information, and how to ask for yours to be removed, is set out at
          tf21.net/privacy.
        </p>
      </>
    ),
  },
  {
    id: "never",
    label: "What it never does",
    icon: Ban,
    title: (
      <>
        WHAT WARDEN WILL <em>NEVER DO.</em>
      </>
    ),
    body: <List items={NEVER} />,
    tick: "I understand what WARDEN sends to tf21.net and what it will never do.",
  },
  {
    id: "terms",
    label: "Terms",
    icon: FileCheck2,
    title: (
      <>
        YOUR CONTROLS, <em>AND THE TERMS.</em>
      </>
    ),
    body: (
      <>
        <p>
          Mute any kind of notification, switch sounds off, stop it starting
          with Windows, sign out, pause seeding or quit, all from inside the app
          or its tray icon. Uninstall it from Windows Settings like any other
          app; that removes it completely.
        </p>
        <p>
          WARDEN is free and is offered to the Task Force 21 community as it is,
          without warranty. Use it only on a PC that is yours to decide about.
          TF21's rules apply to how you use it. TF21 may change the app and
          these terms; when it does, you will be asked again before the new
          version does anything more than check for updates.
        </p>
      </>
    ),
    tick: "I accept the terms of use.",
  },
  {
    id: "seeding",
    label: "Automatic seeding",
    icon: MousePointerClick,
    title: (
      <>
        THE SEEDING <em>AGREEMENT.</em>
      </>
    ),
    body: <SeedingText />,
  },
];

/** The gate. `review` shows the same steps to somebody who has already accepted them. */
export function Consent({
  version,
  review,
  seedingAgreed = false,
}: {
  version: string;
  review?: () => void;
  seedingAgreed?: boolean;
}) {
  const [at, setAt] = useState(0);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [control, setControl] = useState(false);
  const [window, setWindow] = useState(false);
  const step = STEPS[at];
  const last = at === STEPS.length - 1;
  const held = !review && step.tick && !ticked[step.id];
  const accept = (seeding: boolean) => invoke("set_consent", { seeding });
  return (
    <section className="terms wizard">
      {!review && (
        <div className="offline-sign" role="status">
          <ShieldOff size={30} strokeWidth={1.6} aria-hidden="true" />
          <div>
            <b>WARDEN IS NOT TALKING TO TF21</b>
            <span>
              Nothing about you or this PC has been sent, and nothing will be
              until you accept on the last step. All it has done is ask tf21.net
              whether a newer version exists.
            </span>
          </div>
        </div>
      )}
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={i === at ? "now" : i < at ? "past" : ""}
            aria-current={i === at ? "step" : undefined}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <div className="panel wizard-card" key={step.id}>
        <span className="eyebrow">
          <step.icon size={13} aria-hidden="true" />
          Step {at + 1} of {STEPS.length} · Version {version}
        </span>
        <h1>{step.title}</h1>
        {step.body}
        {!review && step.tick && (
          <Tick
            checked={Boolean(ticked[step.id])}
            onChange={(on) => setTicked({ ...ticked, [step.id]: on })}
          >
            {step.tick}
          </Tick>
        )}
        {last && !review && (
          <>
            <Tick checked={control} onChange={setControl}>
              {CONTROL}
            </Tick>
            <Tick checked={window} onChange={setWindow}>
              {WINDOW}
            </Tick>
          </>
        )}
        {last && review && (
          <p className="impact">
            {seedingAgreed
              ? "You have agreed to automatic seeding on this PC."
              : "You have not agreed to automatic seeding on this PC."}
          </p>
        )}
      </div>
      <div className="actions wizard-actions">
        {at > 0 && (
          <button
            type="button"
            className="button ghost"
            onClick={() => setAt(at - 1)}
          >
            Back
          </button>
        )}
        {!last && (
          <button
            type="button"
            className="button"
            disabled={Boolean(held)}
            onClick={() => setAt(at + 1)}
          >
            Next
          </button>
        )}
        {last && review && (
          <button type="button" className="button" onClick={review}>
            Close
          </button>
        )}
        {last && !review && (
          <>
            <button
              type="button"
              className="button"
              disabled={!control || !window}
              onClick={() => accept(true)}
            >
              Accept, with automatic seeding
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => accept(false)}
            >
              Accept, without automatic seeding
            </button>
          </>
        )}
        {review && !last && (
          <button type="button" className="text" onClick={review}>
            Close
          </button>
        )}
        {!review && (
          <button type="button" className="text" onClick={() => invoke("quit")}>
            Decline and quit
          </button>
        )}
      </div>
      {last && !review && (
        <p className="small">
          Accepting without automatic seeding leaves the Seeding tab visible but
          switched off until you agree to it there.
        </p>
      )}
    </section>
  );
}
