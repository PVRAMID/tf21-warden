// What changed in each version, newest first. Shown in the app under "What's new", and the
// place to write the entry before a release is built. Every entry is authored as PVRAMID.
// The build publishes this list with the installer: it is what an install that is behind shows
// on its Update page. Updating is the user's choice unless an entry they are behind is marked
// `critical`, which locks their app until they update: "security" for a security fix,
// "functionality" when older versions can no longer work with tf21.net. Mark one sparingly.
export type Release = {
  version: string;
  date: string;
  author: "PVRAMID";
  title: string;
  changes: string[];
  critical?: "security" | "functionality";
};

export const CHANGELOG: Release[] = [
  {
    version: "1.2.3",
    date: "2026-10-04",
    author: "PVRAMID",
    title: "Updates are your call, and tighter limits on seeding",
    changes: [
      "WARDEN no longer installs updates by itself. From this version on it tells you a new version is out, shows you what changed on a new Update page, and installs it only when you press Update now.",
      "The one exception is an update marked critical, for security or because older versions can no longer work with tf21.net. Until that is installed WARDEN shuts itself off: it connects to nothing and answers no seed calls. You can update, or uninstall from the same screen.",
      "Your automatic seeding switch, servers and hours are now kept on your PC. tf21.net is sent a copy so it knows whom to ask, but its copy can no longer be what switches seeding on.",
      "WARDEN only clicks, types or pastes once Windows confirms WARDOGS is the window in front and nothing is lying over the button. Otherwise it waits and looks again, so nothing can land in another program.",
      "A seed call always leaves at least 15 seconds to cancel, whatever the website asks for, and the only text WARDEN will paste into the game is a Server ID.",
      "Links in a news article open in your browser. The app's own windows never load another site.",
      "The seeding agreement now says plainly where WARDEN stands with the game's anti-cheat.",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-10-03",
    author: "PVRAMID",
    title: "Safer sign-in",
    changes: [
      "Signing in now shows a six-digit number in the app that you type on tf21.net. A sign-in link sent to you by somebody else can no longer be used to link their app to your profile.",
    ],
  },
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
