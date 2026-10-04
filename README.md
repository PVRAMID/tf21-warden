# TF21 WARDEN

The source code of **TF21 WARDEN**, the Windows companion app of the
[Task Force 21](https://tf21.net) WARDOGS community. This is version **1.4.0**.

> **This repository is public for one reason: so you can see exactly what the app does.**
> It is here for privacy reassurance and transparency. It is **not** open source and it is
> **not for reuse**. You may read it. You may not copy, modify, redistribute or reuse it, or any
> part of it, without explicit written permission from Task Force 21. See [LICENSE](LICENSE).

## What WARDEN is for

WARDEN sits in the system tray and:

- shows TF21 announcements, news, live server status with each match's score, competitions and
  leaderboards, and a signed-in member's own record;
- lets a signed-in member report a player to TF21's staff, with clip links and screenshots;
- delivers desktop notifications from TF21, and keeps an inbox of them;
- tells you when a new version is out and shows you what it changes; you decide whether to
  install it (only an update marked critical, for security or because old versions can no
  longer work, has to be installed for the app to carry on);
- and, **only for people who opt in**, answers *seed calls*: it launches WARDOGS, joins a quiet
  TF21 server, and closes the game again when the server is seeded.

Download it from <https://tf21.net/warden>. Its terms and privacy information are shown inside
the app, step by step, before it sends anything, and again after every update. The same text is
in [`src/terms.tsx`](src/terms.tsx), and TF21's privacy policy is at <https://tf21.net/privacy>.

## ⚠️ What has been removed or left out of this repository

**Read this section. Nothing here is hidden quietly: every omission is listed.**

| Left out or changed | Why |
|---|---|
| **TF21's update-signing private key** | It is what proves an update really came from TF21. It has never been stored in this code and is not here. Only the matching *public* key appears, in `src-tauri/tauri.conf.json`, which is safe to publish and is how the app checks an update is genuine. |
| **The release build script** (`build.mjs`) | **REDACTED AND REPLACED.** TF21's own script reads that private key from a private location on a private machine. The `build.mjs` in this repository is a public stand-in that takes a key from the environment instead. |
| **The end-to-end test harness** (`smoke.mjs`) | **WITHHELD.** It runs the app against the website's server code, which is not public. |
| **The tf21.net website and its server code** | **NOT INCLUDED.** This repository is the app only. The website, its database, its dashboard and the server side of the API the app talks to are private. What the app sends to that API is all in this repository, and is listed below. |
| **The built installer and update files** | **NOT INCLUDED.** They are published at tf21.net. This repository is source only. |
| **Commit history** | **NOT INCLUDED.** The app is developed inside TF21's private repository. Each release is exported here as a fresh snapshot, so this repository's history shows releases, not day-to-day work. |

No application code has been altered for publication. Apart from the files named above, and one
line removed from `package.json` (the command that runs the withheld test harness), every file
here is the same file TF21 builds the released app from. No passwords, tokens,
keys, private addresses or personal information are in this repository; the export that produces
it scans every file and refuses to publish if it finds any.

## How it works

WARDEN is a [Tauri 2](https://tauri.app) app: a small Rust core with a web-technology interface.

| Where | What it is |
|---|---|
| [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) | The core: start-up, the update check, the terms gate, the connection to tf21.net, notifications, the tray. |
| [`src-tauri/src/guard.rs`](src-tauri/src/guard.rs) | Everything the app reads from your PC: whether WARDOGS is installed and running, the signed-in Steam ID, whether something has the screen, the clock. |
| [`src-tauri/src/seed.rs`](src-tauri/src/seed.rs) | A seed call from start to finish: the countdown, the join, and closing the game afterwards. |
| [`src-tauri/src/driver.rs`](src-tauri/src/driver.rs) | The automatic join: reading the WARDOGS window with Windows' own text recognition and pressing the menu buttons. Used only for automatic seeding. |
| [`src/terms.tsx`](src/terms.tsx) | The terms and privacy information, word for word as the app shows them. |
| [`src/`](src) | The rest of the interface. `src/mock.ts` is a stand-in used only when developing the interface in a browser; it is not part of a released build. |
| [`src/changelog.ts`](src/changelog.ts) | What changed in each version. |

### Everything the app sends

The app talks to **tf21.net and nothing else**. Every request it can make is in
`src-tauri/src/lib.rs` and `src-tauri/src/seed.rs`:

| Request | What is sent |
|---|---|
| Update check (`/app/update/...`) | The app's version and platform. This is the only request made before the terms are accepted. |
| Register (`POST /api/app/devices`) | The PC's name and the app's version. The website replies with a random ID and key for the install. |
| Consent (`POST /api/app/consent`) | That the terms were accepted, for which version, and whether automatic seeding was agreed to. |
| Heartbeat (`POST /api/app/heartbeat`, every 30 seconds) | The app's version, the SteamID64 signed in to Steam, whether the PC could answer a seed call right now, and a one-word reason if not. |
| Settings (`PUT /api/app/settings`) | Your seeding hours and servers, muted notifications and the sound switch. |
| Seed call answers (`POST /api/app/offers/...`) | Joined, declined, cancelled or failed, with a short reason. |
| Inbox (`/api/app/feed...`) | Which notifications you opened or cleared. |
| Sign-in (`POST /api/app/link`) | A request for a one-time code and a six-digit number. Signing in happens in your browser, where you type the number the app shows; the app never sees a password. |
| Player reports (`/api/app/reports...`) | Only if you file one from the app: the report you wrote, any clip links, and any screenshots you picked to attach. Looking a player up sends what you typed in the search box. |
| Reading (`GET`) | Public server status, news, competitions and leaderboards, and your own record when signed in. |

### What it reads on your PC, and what it never does

It reads Steam's list of installed games, the list of running programs (to see whether WARDOGS
is running), the signed-in Steam ID from the Windows registry, and Windows' yes-or-no answer to
"does something have the screen?". For automatic seeding it takes pictures of **the WARDOGS
window only**, reads them on your PC, and discards them at once; they are never saved or sent.

It does not read your files, browser, passwords or messages, record what you type, capture your
desktop or other windows, use your camera or microphone, or run with administrator rights. The
one file it ever reads is a screenshot you pick yourself to attach to a player report (`attach`
in `src-tauri/src/lib.rs`). You can check each of those statements against the code above.

## Security: what could go wrong, and what stops it

The installer for this version, as served from <https://tf21.net/warden>, has this SHA-256:

```
f9e1081c383217b8cd1668fb767f8e1ec5a6ad473407f84ba9246687e6429869
```

Check yours in PowerShell with `Get-FileHash .\TF21-WARDEN-Setup.exe`. This page is not hosted
on tf21.net, so the two would both have to be tampered with for a swapped installer to pass.

### Updates

Every update is signed (minisign, through Tauri's updater). The private half of the signing key
exists only on the developer's build machine: it is **not on tf21.net**, not in this repository
and never sent anywhere. The public half is compiled into the app
(`src-tauri/tauri.conf.json`), and the app refuses any update whose signature does not verify
against it. Somebody who took over tf21.net, or sat between you and it, could stop you getting
an update. They could not make the app install theirs.

Updates are also not installed behind your back. The app tells you a new version is out, shows
its changelog on the Update page, and installs it when you press Update now. The exception is an
update marked critical (a security fix, or one without which the app can no longer work with
tf21.net): the app then shuts itself off, connecting to nothing and answering no seed calls,
until you either update or uninstall. That mark is the website's word and is not covered by the
signature, so a hijacked tf21.net could lock installs. It still could not make them install
anything that TF21 did not sign. See `look` and `described` in
[`src-tauri/src/lib.rs`](src-tauri/src/lib.rs).

What that does not cover, said plainly:

- The first installer is not yet signed with a Windows code-signing certificate, which is why
  Windows shows its "protected your PC" prompt. Use the SHA-256 above.
- TF21 builds the installer from this source, and the build is not bit-for-bit reproducible.
  This repository shows what the code does; you are still trusting TF21 to have built it from
  what is shown, as you are with any app you do not build yourself.

### What tf21.net can make the app do

The website can send an install five things: a notification (or the removal of one), a seed
call, word that a seed call has ended, word that your sign-in changed, and word that a new
version exists. None of them carries code, a command, a file, a screen position or a key press.
See `dispatch` in [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs).

A seed call names a server and its Server ID, and nothing else that matters. Everything that
decides whether the app acts on it is on your PC:

| Decided on your PC | Where |
|---|---|
| That you agreed to the automatic seeding agreement, for this version | `seeding_agreed` in `lib.rs` |
| That automatic seeding is switched on, for that server, at this hour. The choice is stored on your PC; the website's copy is only how it knows whom to ask | `own_autoseed`, `availability` and `seeds` in `lib.rs` |
| That you have not paused or snoozed it, and are not in a game or a full-screen app | `availability` in `lib.rs`, `guard.rs` |
| A countdown you can cancel, never shorter than 15 seconds | `seconds` in `seed.rs` |
| Where to click: the words read off the WARDOGS window, never a position sent by the website | `read` in `driver.rs` |
| That WARDOGS is the window in front, and under the pointer, before any click, key or paste | `focus` and `click` in `driver.rs` |
| That the one thing pasted is a Server ID: letters, digits and hyphens | `server_id` in `driver.rs` |

So the worst a hijacked tf21.net could do through seed calls is this: people who have agreed,
switched seeding on, are inside their chosen hours and are not using their PC would see a
countdown and, if they did not cancel it, WARDOGS would start through Steam and join a WARDOGS
server of the attacker's choosing. It could also send a notification with a misleading link,
which opens in your browser only if you click it. It could not run anything, install anything,
or click or type outside WARDOGS.

### Signing in, and keys

The app holds no password, API key or shared secret. On first run the website issues the
install a random token, kept in the app's settings file in your Windows profile; the website
stores only a hash of it. Signing in happens on tf21.net in your own browser, with Discord's
login, and is tied to the install by a six-digit number that only the app shows. The app never
sees a password or a Discord token.

### The game and its anti-cheat

WARDOGS has its own anti-cheat. WARDEN does not read or change the game's memory or files, puts
nothing inside the game's process and passes it no launch options. It starts the game through
Steam (`steam://run`), reads a picture of the game's window, and presses menu buttons with
ordinary simulated mouse and keyboard input, never once you are in a match. The only thing it
ever does to the game's process is close it, and only a game it started itself.

None of that is what anti-cheat exists to catch. But TF21 does not make WARDOGS or its
anti-cheat and cannot make promises on its developers' behalf. Automatic seeding is optional;
without it the app never goes near the game beyond handing Steam a join link.

## AI disclosure

- WARDEN was **built with the assistance of AI** coding tools, directed, reviewed and released
  by a person.
- **There is no AI inside the app.** It contains no AI model and calls no AI service. The text
  recognition it uses to read the WARDOGS window is the ordinary one built into Windows, and it
  runs on your PC.
- **Nothing from the app is used to train AI models.** The app sends what is listed above to
  tf21.net and to nobody else, and TF21 does not sell, share or farm it for AI training or
  anything else.

## Questions

Write to hq@tf21.net. WARDEN is made by Task Force 21, a player community. It is not made or
endorsed by the developers of WARDOGS.
