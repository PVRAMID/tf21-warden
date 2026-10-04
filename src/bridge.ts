import { useEffect, useState } from "react";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import type { Release } from "./changelog";

export type Autoseed = {
  enabled: boolean;
  servers: string[];
  days: number[];
  from: string;
  to: string;
};
export type DeviceSettings = {
  autoseed: Autoseed;
  mutes: string[];
  follows: string[];
  sound: boolean;
};
export type Me = {
  device: { id: string; name: string };
  profile: { id: string; callsign: string; avatar: string } | null;
  steam: { linked: boolean; steam_id: string | null; name: string | null };
  settings: DeviceSettings;
  servers: { slug: string; name: string; number: number }[];
  bonus: {
    enabled: boolean;
    call_coins: number;
    minute_coins: number;
    per_minutes: number;
    weekly_coins: number;
    weekly_calls: number;
  };
  site: string;
};
export type Seed = {
  phase: "idle" | "countdown" | "launching" | "seeding" | "closing";
  server: { slug: string; name: string; number?: number } | null;
  test: boolean | null;
  step: string;
  seconds: number | null;
};
export type State = {
  version: string;
  site: string;
  online: boolean;
  paused: boolean;
  me: Me | null;
  seed: Seed;
  available: boolean;
  reason: string;
  steam_id: string | null;
  game_installed: boolean;
  autostart: boolean;
  /** The update check made before anything else is shown. */
  boot: { status: "checking" | "clear" };
  /** A newer published version: optional unless critical, which locks the app until installed. */
  update: {
    version: string;
    notes: string;
    /** Every version this install is behind by, newest first. */
    changes: Release[];
    critical: "security" | "functionality" | null;
  } | null;
  /** Whether the terms still need accepting for this version, and the seeding agreement. */
  consent: { needed: boolean; seeding: boolean };
  /** The notification waiting on the popup card, if any. */
  notice: Notification | null;
};
export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  url: string;
  created_at: string;
  image: string;
  sound: boolean;
  opened: boolean;
};

// Outside the Tauri shell (vite on its own, the browser tests) a stand-in answers instead.
const shell = "__TAURI_INTERNALS__" in window;
const mock = !shell && import.meta.env.DEV ? import("./mock") : null;

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (mock) return (await mock).invoke(command, args) as Promise<T>;
  return tauriInvoke<T>(command, args);
}
export const listen = (event: string, handler: (payload: unknown) => void) =>
  shell
    ? tauriListen(event, (e) => handler(e.payload))
    : Promise.resolve(() => {});

/** A JSON call to tf21.net, made by the app's core so the device token never reaches the page. */
export const api = <T>(path: string, method = "GET", body?: unknown) =>
  invoke<T>("api", { method, path, body: body ?? null });

/** The core's state, kept fresh: on every change it announces, and each second while busy. */
export function useWarden() {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => invoke<State>("state").then((s) => alive && setState(s));
    void read();
    const stop = listen("changed", read);
    const timer = setInterval(read, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      void stop.then((off) => off());
    };
  }, []);
  return state;
}

/** Reads a website path now and again every `ms`; keeps the last good answer. */
export function useRead<T>(path: string | null, ms = 0) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    setData(null);
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

export const REASONS: Record<string, string> = {
  ready: "Ready for a seed call",
  update: "Update WARDEN to carry on",
  no_consent: "The seeding agreement has not been accepted",
  signed_out: "Sign in to switch on automatic seeding",
  no_steam: "Link your Steam account on tf21.net first",
  off: "Automatic seeding is off",
  paused: "Paused from the tray",
  snoozed: "Snoozed for an hour",
  hours: "Outside your seeding hours",
  no_game: "WARDOGS is not installed on this PC",
  seeding: "Answering a seed call",
  in_game: "WARDOGS is running",
  busy: "A game or full-screen app is running",
};

export const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};
