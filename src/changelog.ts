// What changed in each version, newest first. Shown in the app under "What's new", and the
// place to write the entry before a release is built. Every entry is authored as PVRAMID.
export type Release = {
  version: string;
  date: string;
  author: "PVRAMID";
  title: string;
  changes: string[];
};

export const CHANGELOG: Release[] = [
  {
    version: "1.2.1",
    date: "2026-10-03",
    author: "PVRAMID",
    title: "The source is public",
    changes: [
      "WARDEN's source code is now published so anyone can read exactly what the app does. Settings has a link to it.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-03",
    author: "PVRAMID",
    title: "Your record, competitions and leaderboards",
    changes: [
      "New: My record. Your kills, deaths, K/D, matches and hours on each server, your last matches, your seeding time and your Tascoin wallet.",
      "New: Competitions and Leaderboards, with live standings.",
      "New: What's new, the page you are reading.",
      "New: the app tells you when a dispatch is published or a server you follow starts seeding.",
      "The terms and privacy information is now a step-by-step walkthrough, with a clear sign that nothing is sent until you accept. TF21 now keeps a record that you accepted.",
      "WARDEN checks for a newer version before it shows anything else, and updates arrive live while it runs.",
      "Join buttons now simply hand Steam a join link. WARDEN only takes the mouse and keyboard for automatic seeding.",
      "Fixed: pictures in notifications and news were not loading.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-03",
    author: "PVRAMID",
    title: "Popup notifications and the terms screen",
    changes: [
      "Notifications from TF21 now pop up on screen, with an optional picture and sound.",
      "Clear items from your inbox, one at a time or all at once.",
      "A switch for notification sounds in Settings.",
      "Terms of use and privacy information on first run and after every update, with a separate agreement for automatic seeding.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-03",
    author: "PVRAMID",
    title: "First release",
    changes: [
      "Server status, news and an inbox in one tray app that starts with Windows and updates itself.",
      "Opt-in automatic seeding: WARDEN joins a quiet server for you and closes the game when it is seeded.",
    ],
  },
];
