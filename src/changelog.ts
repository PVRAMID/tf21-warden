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
    version: "1.4.0",
    date: "2026-10-04",
    author: "PVRAMID",
    title: "Report everyone involved at once",
    changes: [
      "One report can now name everyone involved. On the Who step, pick the first player, then use Add another player for the next, up to ten. A mass teamkill or a group working together no longer needs a report filled in for each of them: you describe it and attach your evidence once.",
      "If you could not catch a name, add them as Identity unknown. Staff will try to work out who it was from your evidence, but we may not be able to take action against a player we cannot identify, so a clip matters even more.",
      "Teaming is its own kind of report: players on opposing sides working together. It asks you to add everyone who was in on it.",
      "Each player you name gets their own report ID, so staff can deal with them one at a time and you are told the outcome for each. Your reports list shows them all.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-04",
    author: "PVRAMID",
    title: "The match at a glance, and reports from the app",
    changes: [
      "The Servers screen now shows each match as it stands: the score by faction, the match clock, the map and mode, and, on servers that publish who is playing, the MVP so far with their kills, deaths and K/D, and the three players behind them. The cards on Home carry the score and the clock too.",
      "Report a player without leaving WARDEN. The new Report a player screen asks what tf21.net/report asks: what happened, who it was (anyone on a server right now is listed first), your clip links and screenshots, and the details. Your reports and where they stand are listed there, and every server on the Servers screen has a Report a player button that fills the server in for you.",
      "A finer finish throughout. Screens arrive piece by piece, numbers tick over when they change, buttons, panels and lists answer the pointer, and a live server glows. All of it stands still if Windows is set to reduce motion.",
      "Tidied the layout: the Home headline no longer crowds the status under it, panels side by side are the same height, and long server names wrap instead of being cut off.",
      "New in what the app sends, and in its terms: a report you choose to file, and any screenshot you pick to attach to it. Nothing else on your PC is read.",
    ],
  },
  {
    version: "1.2.4",
    date: "2026-10-04",
    author: "PVRAMID",
    title: "Automatic joins that find the right button",
    changes: [
      "Fixed automatic joins clicking Firing Range, or the gap beside a button, instead of Deploy. Windows' text reader sometimes judged the game's menu to be at a slight slant and reported every position a little off. WARDEN now corrects for that.",
      "Fixed automatic joins stopping at the server browser at 1080p and below, where the menu's small print was misread. The picture is now enlarged before it is read.",
      "WARDEN waits for the game's own start-up checks to finish before pressing Deploy, and moves the pointer out of the way after each click so it never covers the words it has to read next.",
      "Checked from a cold start at 1024x768, 1280x720, 1280x1024, 1366x768, 1600x900, 1680x1050, 1920x1080, 1920x1200 and 2560x1440, and in a 21:9 window.",
    ],
  },
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
