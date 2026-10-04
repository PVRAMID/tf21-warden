// A stand-in for the Rust core when the UI runs in a plain browser: `npm run ui`, screenshots
// and the browser tests. Public reads go to the live site through the dev proxy-free fetch below.
import type { DeviceSettings, State } from "./bridge";

const query = new URLSearchParams(location.search);
const settings: DeviceSettings = {
  autoseed: {
    enabled: true,
    servers: [],
    days: [0, 1, 2, 3, 4],
    from: "09:00",
    to: "17:00",
  },
  mutes: [],
  follows: [],
  sound: true,
};
const signedIn = query.get("guest") === null;
const state: State = {
  version: "1.0.0",
  site: "https://tf21.net",
  online: true,
  paused: false,
  me: {
    device: { id: "d1", name: "DESK" },
    profile: signedIn ? { id: "p1", callsign: "Sentinel", avatar: "" } : null,
    steam: {
      linked: signedIn,
      steam_id: signedIn ? "76561198000000001" : null,
      name: "Sentinel",
    },
    settings,
    servers: [
      { slug: "uk1", name: "[EU/UK] #1 Task Force 21 - KOTH", number: 1 },
      {
        slug: "uk2",
        name: "[EU/UK] #2 Task Force 21 - Infantry Only",
        number: 2,
      },
    ],
    bonus: {
      enabled: true,
      call_coins: 50,
      minute_coins: 10,
      per_minutes: 10,
      weekly_coins: 250,
      weekly_calls: 5,
    },
    site: "https://tf21.net",
  },
  seed: {
    phase: (query.get("phase") as State["seed"]["phase"]) || "idle",
    server: { slug: "uk1", name: "[EU/UK] #1 Task Force 21 - KOTH", number: 1 },
    test: null,
    step: "menu",
    seconds: 42,
  },
  available: signedIn,
  reason: signedIn ? "ready" : "signed_out",
  steam_id: "76561198000000001",
  game_installed: true,
  autostart: true,
  boot: { status: "clear" },
  // ?update for one you may take or leave, ?update=security or =functionality for a lock.
  update: query.has("update")
    ? {
        version: "1.3.1",
        notes: "Faster joins and a fix for the inbox.",
        changes: [
          {
            version: "1.3.1",
            date: "2026-11-02",
            author: "PVRAMID",
            title: "A fix for the inbox",
            changes: ["Clearing a notification no longer brings it back."],
            ...(query.get("update")
              ? { critical: query.get("update") as "security" }
              : {}),
          },
          {
            version: "1.3.0",
            date: "2026-10-20",
            author: "PVRAMID",
            title: "Faster joins",
            changes: [
              "Automatic joins read the game's menus sooner.",
              "The Seeding tab shows how long each call lasted.",
            ],
          },
        ],
        critical: (query.get("update") || null) as "security" | null,
      }
    : null,
  consent: { needed: query.has("terms"), seeding: !query.has("noseed") },
  notice: query.has("notice")
    ? {
        id: 9,
        kind: "announcement",
        title: "Server wipe at nine tonight",
        body: "Spend your cash before 21:00. Both servers restart on the new map rotation straight after.",
        url: "/blog/post-1",
        image: query.get("notice") || "",
        sound: true,
        created_at: new Date().toISOString(),
        opened: false,
      }
    : null,
};

const server = (
  slug: string,
  name: string,
  current: number,
  seeding: boolean,
) => ({
  slug,
  name,
  status: {
    state: "running",
    online: true,
    uptime_ms: 88675853,
    match: {
      map: seeding ? "Zestafona" : "Bakurani",
      experiences: seeding
        ? ["Zestafona_KOTH_01"]
        : ["Bakurani_KOTH_01", "KOTH_InfantryOnly"],
      lighting: "DayEarlyClear",
      match_seconds: seeding ? 95 : 1282,
      score_cap: null,
      players: { current, max: 100 },
      factions: [
        { name: "Lonestar", color: "#4cb1ef", score: seeding ? 0 : 12 },
        { name: "Valkyra", color: "#fa503e", score: seeding ? 1 : 21 },
        { name: "Manticore", color: "#1dd65c", score: seeding ? 0 : 34 },
      ],
    },
    // The first publishes who is on it; the second keeps its roster to itself.
    ...(seeding
      ? {
          players: [
            { name: "Kwalepe", faction: "Valkyra", kills: 14, deaths: 3 },
            { name: "Norris", faction: "Lonestar", kills: 9, deaths: 6 },
            { name: "x_Reaper_x", faction: "Manticore", kills: 9, deaths: 8 },
            { name: "Tovarisch", faction: "Valkyra", kills: 4, deaths: 7 },
            { name: "Bagpuss", faction: "Lonestar", kills: 1, deaths: 5 },
          ],
        }
      : {}),
    facts: { region: "UK / LONDON" },
    seeding: { active: seeding, smart: { target_players: 30 } },
  },
});
const post = (n: number, title: string) => ({
  id: String(n),
  slug: `post-${n}`,
  title,
  excerpt:
    "Bulkhead have held their hands up regarding community server support. Here is what has changed and what it means for our servers.",
  cover_url: null,
  tags: ["wardogs", "patch notes"],
  reading_minutes: 4,
  published_at: new Date(Date.now() - n * 86400000).toISOString(),
  content_html:
    "<p>The full dispatch.</p><h2>What changed</h2><p>Everything.</p>",
});
const FIXTURES: Record<string, unknown> = {
  "/api/app/record": {
    signed_in: true,
    steam_linked: true,
    servers: [
      {
        slug: "uk1",
        name: "[EU/UK] #1 Task Force 21 - KOTH",
        number: 1,
        totals: {
          kills: 1840,
          deaths: 1105,
          kd: 1.67,
          matches: 92,
          play_seconds: 301000,
          last_seen: null,
        },
        month: {
          kills: 412,
          deaths: 240,
          kd: 1.72,
          matches: 21,
          play_seconds: 68000,
          last_seen: null,
        },
        recent: [
          {
            map: "Zestafona",
            started_at: new Date(Date.now() - 86400000).toISOString(),
            kills: 31,
            deaths: 14,
            faction: "Lonestar",
            play_seconds: 5400,
            winner: "Lonestar",
          },
          {
            map: "Ozeti",
            started_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            kills: 12,
            deaths: 17,
            faction: "Dragoons",
            play_seconds: 3100,
            winner: "Lonestar",
          },
        ],
      },
    ],
    seeding: { seconds: 51200, sessions: 37 },
    wallet: {
      enabled: true,
      balance: 12450,
      earned: 15000,
      week: 1320,
      rank: 4,
      holders: 212,
      recent: [
        {
          id: 1,
          source: "warden",
          day: "2026-10-03",
          amount: 50,
          note: "Answered a seed call for #1",
        },
        { id: 2, source: "seeding", day: "2026-10-03", amount: 300, note: "" },
        {
          id: 3,
          source: "purchase",
          day: "2026-10-02",
          amount: -2000,
          note: "Callsign colour",
        },
      ],
    },
  },
  "/api/competitions": {
    competitions: [
      {
        slug: "the-october-mvp",
        name: "The October MVP",
        description: "Win the most matches this month.",
        metric_label: "Matches won",
        scope_label: "Everyone on the server",
        state: "live",
        starts_at: "2026-09-30T23:00:00Z",
        ends_at: "2026-10-24T22:59:00Z",
      },
    ],
  },
  "/api/leaderboards": {
    boards: [
      {
        slug: "kills",
        title: "Server | Kills (30 days)",
        description: "Who is doing the damage.",
        measurement: { label: "Kills" },
      },
    ],
  },
  "/api/app/reports/config": {
    enabled: true,
    intro: "",
    types: [
      {
        id: "cheating",
        label: "Cheating",
        short: "Aimbot, wallhack, exploits that give an unfair edge.",
        questions: [
          {
            id: "seen",
            label: "What did you see?",
            type: "multiselect",
            required: true,
            options: [
              "Snapping or locked aim",
              "Tracking players through walls",
              "No recoil or spread",
              "Other",
            ],
          },
          {
            id: "against",
            label: "Who was on the receiving end?",
            type: "radio",
            required: true,
            options: ["Me", "A teammate", "Watched from spectate or killcam"],
          },
          {
            id: "pattern",
            label: "How often, and over how many rounds?",
            type: "textarea",
            placeholder: "Every engagement across two maps, only when…",
          },
        ],
      },
      {
        id: "teamkilling",
        label: "Teamkilling",
        short: "Deliberately killing their own side.",
        questions: [],
      },
      {
        id: "griefing",
        label: "Griefing",
        short: "Wasting vehicles, blocking, sabotaging the team.",
        questions: [],
      },
      {
        id: "comms",
        label: "Malicious communications",
        short: "Abuse, harassment, hate speech, threats.",
        questions: [],
      },
      {
        id: "exploiting",
        label: "Exploiting",
        short: "Glitches, out-of-bounds, abusing a bug.",
        questions: [],
      },
      {
        id: "other",
        label: "Something else",
        short: "A rule broken that none of the above covers.",
        questions: [],
      },
    ],
    servers: [
      { id: "s1", slug: "uk1", name: "[EU/UK] #1 Task Force 21 - KOTH" },
      {
        id: "s2",
        slug: "uk2",
        name: "[EU/UK] #2 Task Force 21 - Infantry Only",
      },
    ],
    evidence: {
      intro:
        "In order for us to be able to deal with a report against a player, we require evidence. The minimum standard is a clip, or, if it can be clearly shown in a screenshot with context, a screenshot is acceptable.",
      standards: [
        "Clips must provide two minutes minimum of footage prior to the incident.",
        "Clips must have audio.",
        "Clips must show the substance of the report.",
      ],
      noClip:
        "You can download clipping software for free. We recommend Medal: it is lightweight, and clips are uploaded and shared in the press of a single button.",
      medalUrl: "https://medal.tv/",
      fallback:
        "If you haven't got a clip, or sufficient evidence, we may not be able to deal with your report. We will always log a report against a player so we have the information for future reference.",
    },
    limits: {
      description_min: 40,
      text_max: 4000,
      clips: 5,
      screenshots: 6,
      window_days: 90,
    },
    me: { steam_linked: true },
  },
  "/api/app/reports/players": {
    online: 2,
    players: [
      {
        steam_id: "76561198000000002",
        name: "x_Reaper_x",
        names: ["Reaper", "definitely not reaper"],
        last_seen: new Date().toISOString(),
        matches: 40,
        online: { slug: "uk1", name: "[EU/UK] #1 Task Force 21 - KOTH" },
      },
      {
        steam_id: "76561198000000003",
        name: "Kwalepe",
        names: [],
        last_seen: new Date().toISOString(),
        matches: 212,
        online: { slug: "uk1", name: "[EU/UK] #1 Task Force 21 - KOTH" },
      },
      {
        steam_id: "76561198000000004",
        name: "Tovarisch",
        names: [],
        last_seen: new Date(Date.now() - 5 * 3600000).toISOString(),
        matches: 7,
        online: null,
      },
    ],
  },
  "/api/app/reports/mine": {
    reports: [
      {
        ref: "R-7K3QXA",
        type: "cheating",
        suspect_name: "x_Reaper_x",
        status: "reviewing",
        outcome: null,
        created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
        unread: true,
      },
      {
        ref: "R-4MNP2C",
        type: "teamkilling",
        suspect_name: "Bagpuss",
        status: "closed",
        outcome: "actioned",
        created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
        unread: false,
      },
    ],
  },
  "/api/app/reports": { report: { ref: "R-9WX3HB", status: "open" } },
  "/api/servers": {
    servers: [
      server("uk1", "[EU/UK] #1 Task Force 21 - KOTH", 12, true),
      server("uk2", "[EU/UK] #2 Task Force 21 - Infantry Only", 87, false),
    ],
  },
  "/api/blog": {
    items: [
      post(1, "WARDOGS patch 0.11: the server browser update"),
      post(3, "Tascoin night owl bonus goes live"),
      post(8, "Operation Black Kettle: after-action report"),
    ],
    total: 3,
  },
  "/api/app/feed": {
    items: [
      {
        id: 3,
        kind: "announcement",
        title: "Operation tonight, 20:00",
        body: "Sign up in Discord. Server #1, KOTH.",
        url: "/operations",
        created_at: new Date(Date.now() - 20 * 60000).toISOString(),
        image: "",
        sound: false,
        opened: false,
      },
      {
        id: 2,
        kind: "news",
        title: "New dispatch: patch 0.11",
        body: "",
        url: "/blog/post-1",
        created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
        image: "",
        sound: false,
        opened: true,
      },
    ],
  },
};

export async function invoke(command: string, args: Record<string, any> = {}) {
  switch (command) {
    case "state":
      return state;
    case "api": {
      const path = String(args.path).split("?")[0];
      if (path === "/api/app/settings") {
        state.me!.settings = args.body;
        return args.body;
      }
      if (path.startsWith("/api/blog/"))
        return post(1, "WARDOGS patch 0.11: the server browser update");
      return FIXTURES[path] ?? null;
    }
    case "attach":
      return { id: crypto.randomUUID(), name: args.name };
    case "set_paused":
      state.paused = args.paused;
      return null;
    case "set_autostart":
      state.autostart = args.enabled;
      return null;
    case "link":
      return { code: "ABCD2345", check: "481516", url: "" };
    case "set_consent":
      state.consent = { needed: false, seeding: args.seeding };
      return null;
    case "dismiss_notice":
      state.notice = null;
      return null;
    case "decide":
      state.seed.phase = "idle";
      return null;
    default:
      return null;
  }
}
