// Builds the WARDEN installer. This is the public stand-in for TF21's release script: the
// original reads TF21's private update-signing key from a private location, and that part has
// been removed. To build your own copy, supply a key of your own:
//   TAURI_SIGNING_PRIVATE_KEY=... TAURI_SIGNING_PRIVATE_KEY_PASSWORD=... node build.mjs
// A copy you build yourself is not signed by TF21 and will not accept TF21's updates.
import { execSync } from "node:child_process";

if (!process.env.TAURI_SIGNING_PRIVATE_KEY)
  throw new Error("Set TAURI_SIGNING_PRIVATE_KEY to a Tauri updater key of your own.");
execSync("npx tauri build", {
  stdio: "inherit",
  env: { ...process.env, TF21_SITE: "https://tf21.net" },
});
