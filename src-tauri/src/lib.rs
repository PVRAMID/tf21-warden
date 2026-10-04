mod driver;
mod guard;
mod seed;

use serde_json::{json, Value};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_notification::NotificationExt as _;
use tauri_plugin_updater::UpdaterExt as _;
use windows::core::PCWSTR;
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// The chime a notification plays when staff ask for one.
static CHIME: &[u8] = include_bytes!("../sounds/chime.wav");
const DEFAULT_SITE: &str = match option_env!("TF21_SITE") {
    Some(site) => site,
    None => "https://tf21.net",
};

pub struct Core {
    pub site: String,
    dir: PathBuf,
    token: Mutex<Option<String>>,
    pub me: Mutex<Value>,
    pub online: AtomicBool,
    pub paused: AtomicBool,
    pub snoozed_until: Mutex<Option<Instant>>,
    pub seed: Mutex<seed::Seed>,
    /// Set to abandon a join that is under way.
    pub stop: AtomicBool,
    /// Notifications waiting their turn on the popup card, oldest first.
    notices: Mutex<VecDeque<Value>>,
    /// What the user agreed to, and for which version: `{version, seeding}`. A new version
    /// asks again, and until the terms are accepted the app contacts nobody.
    consent: Mutex<Value>,
    /// Whether, when and for which servers this PC seeds: `{enabled, servers, days, from, to}`.
    /// It is kept and decided here. The website holds a copy so it knows whom to ask, but its
    /// copy is never what switches seeding on.
    autoseed: Mutex<Value>,
    /// The check made before anything else is shown: `{status}`, checking or clear.
    boot: Mutex<Value>,
    /// A newer published version, once one is known: `{version, notes, changes, critical}`.
    /// Installing it is the user's choice, unless `critical` says security or functionality:
    /// then the app is locked, and does nothing, until it is installed.
    update: Mutex<Value>,
    /// Set to have the update loop look again now rather than at its next turn.
    check_now: AtomicBool,
}

pub type Shared = Arc<Core>;

impl Core {
    fn state_file(&self) -> PathBuf {
        self.dir.join("state.json")
    }
    fn save(&self) {
        let _ = std::fs::create_dir_all(&self.dir);
        let _ = std::fs::write(
            self.state_file(),
            json!({
                "token": *self.token.lock().unwrap(),
                "paused": self.paused.load(Ordering::Relaxed),
                "consent": *self.consent.lock().unwrap(),
                "autoseed": *self.autoseed.lock().unwrap(),
                // Kept so a lock outlasts a restart with tf21.net out of reach.
                "update": *self.update.lock().unwrap(),
            })
            .to_string(),
        );
    }

    /// One JSON request to the website. The device token only ever goes to /api/app.
    pub fn call(&self, method: &str, path: &str, body: Option<&Value>) -> Result<Value, String> {
        if !path.starts_with("/api/") {
            return Err("Not a website API path.".into());
        }
        let mut request = ureq::request(method, &format!("{}{}", self.site, path))
            .timeout(Duration::from_secs(20))
            .set("User-Agent", &format!("TF21-WARDEN/{VERSION}"));
        if path.starts_with("/api/app") {
            if let Some(token) = self.token.lock().unwrap().as_deref() {
                request = request.set("Authorization", &format!("Bearer {token}"));
            }
        }
        self.answer(
            path,
            match body {
                Some(body) => request.send_json(body),
                None => request.call(),
            },
        )
    }

    /// Sends one screenshot the user attached to a report they are writing: the only file the
    /// app ever uploads, and only into that report's evidence.
    fn attach(&self, name: &str, mime: &str, picture: &[u8]) -> Result<Value, String> {
        let path = "/api/app/reports/evidence";
        let mut request = ureq::post(&format!("{}{}", self.site, path))
            .timeout(Duration::from_secs(90))
            .set("User-Agent", &format!("TF21-WARDEN/{VERSION}"))
            .set("Content-Type", mime)
            .set("X-File-Name", &header_safe(name));
        if let Some(token) = self.token.lock().unwrap().as_deref() {
            request = request.set("Authorization", &format!("Bearer {token}"));
        }
        self.answer(path, request.send_bytes(picture))
    }

    fn answer(
        &self,
        path: &str,
        response: Result<ureq::Response, ureq::Error>,
    ) -> Result<Value, String> {
        match response {
            Ok(r) if r.status() == 204 => Ok(Value::Null),
            Ok(r) => r
                .into_json()
                .map_err(|_| "The website sent an unreadable answer.".to_string()),
            Err(ureq::Error::Status(401, _)) if path.starts_with("/api/app") => {
                // The website no longer knows this device: start again as a new one.
                *self.token.lock().unwrap() = None;
                self.save();
                Err("This device needs to register again.".into())
            }
            Err(ureq::Error::Status(_, r)) => Err(r
                .into_json::<Value>()
                .ok()
                .and_then(|v| v["error"].as_str().map(String::from))
                .unwrap_or_else(|| "The website refused that.".into())),
            Err(_) => Err("Could not reach tf21.net.".into()),
        }
    }

    fn register(&self) -> Result<(), String> {
        if self.token.lock().unwrap().is_some() {
            return Ok(());
        }
        let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into());
        let made = self.call(
            "POST",
            "/api/app/devices",
            Some(&json!({ "name": name, "version": VERSION })),
        )?;
        let token = made["token"]
            .as_str()
            .ok_or("The website sent no device token.")?;
        *self.token.lock().unwrap() = Some(token.to_string());
        self.save();
        Ok(())
    }

    pub fn refresh(&self, app: &AppHandle) -> Result<(), String> {
        self.register()?;
        let mut me = self.call("GET", "/api/app/me", None)?;
        let adopted = own_autoseed(&mut self.autoseed.lock().unwrap(), &mut me);
        if adopted {
            self.save();
        }
        *self.me.lock().unwrap() = me;
        let _ = app.emit("changed", ());
        Ok(())
    }

    /// Records the seeding choice made on this PC and returns the one it replaces.
    fn set_autoseed(&self, value: Value) -> Value {
        let before = std::mem::replace(&mut *self.autoseed.lock().unwrap(), value);
        self.save();
        before
    }

    /// Whether this PC was opted in to seed that server; no servers chosen means any.
    pub fn seeds(&self, slug: &str) -> bool {
        self.autoseed.lock().unwrap()["servers"]
            .as_array()
            .is_some_and(|s| s.is_empty() || s.iter().any(|x| x == slug))
    }

    /// A critical update is waiting: until it is installed the app connects to nothing and
    /// answers nothing.
    pub fn locked(&self) -> bool {
        self.update.lock().unwrap()["critical"].is_string()
    }

    /// The terms were accepted for this very version.
    pub fn accepted(&self) -> bool {
        self.consent.lock().unwrap()["version"] == VERSION
    }
    /// The separate seeding agreement, which also covers Launch and join.
    pub fn seeding_agreed(&self) -> bool {
        self.accepted() && self.consent.lock().unwrap()["seeding"] == true
    }

    /// Tells the website the terms were accepted, once per answer.
    fn report_consent(&self) {
        let consent = self.consent.lock().unwrap().clone();
        if !self.accepted() || consent["reported"] == true {
            return;
        }
        let sent = self.call(
            "POST",
            "/api/app/consent",
            Some(&json!({ "version": VERSION, "seeding": consent["seeding"] == true })),
        );
        if sent.is_ok() {
            self.consent.lock().unwrap()["reported"] = json!(true);
            self.save();
        }
    }

    /// Whether an auto-join could go ahead on this PC right now, and if not, why.
    pub fn availability(&self) -> (bool, &'static str) {
        if self.locked() {
            return (false, "update");
        }
        if !self.seeding_agreed() {
            return (false, "no_consent");
        }
        let me = self.me.lock().unwrap();
        if me["profile"].is_null() {
            return (false, "signed_out");
        }
        if !me["steam"]["linked"].as_bool().unwrap_or(false) {
            return (false, "no_steam");
        }
        let autoseed = self.autoseed.lock().unwrap().clone();
        if !autoseed["enabled"].as_bool().unwrap_or(false) {
            return (false, "off");
        }
        if self.paused.load(Ordering::Relaxed) {
            return (false, "paused");
        }
        if self
            .snoozed_until
            .lock()
            .unwrap()
            .is_some_and(|t| Instant::now() < t)
        {
            return (false, "snoozed");
        }
        if !guard::within_now(&autoseed) {
            return (false, "hours");
        }
        if !guard::game_installed() {
            return (false, "no_game");
        }
        if self.seed.lock().unwrap().phase != "idle" {
            return (false, "seeding");
        }
        if guard::game_pid().is_some() {
            return (false, "in_game");
        }
        if guard::busy() {
            return (false, "busy");
        }
        (true, "ready")
    }

    fn heartbeat(&self) -> Result<Value, String> {
        let (available, reason) = self.availability();
        self.call(
            "POST",
            "/api/app/heartbeat",
            Some(&json!({
                "version": VERSION,
                "steam_id": guard::steam_id(),
                "available": available,
                "reason": reason,
            })),
        )
    }
}

/// Puts this PC's own seeding choice into what the website sent, so the screens and the checks
/// both go by it. An install from before the choice was kept here has none, and takes the
/// website's copy once: returns true when that happened.
fn own_autoseed(mine: &mut Value, me: &mut Value) -> bool {
    if mine.is_null() {
        *mine = me["settings"]["autoseed"].clone();
        return !mine.is_null();
    }
    if me["settings"].is_object() {
        me["settings"]["autoseed"] = mine.clone();
    }
    false
}

/// Whether version `a` is later than `b`, by its numbers.
fn newer(a: &str, b: &str) -> bool {
    let parts = |v: &str| {
        v.split('.')
            .map(|n| n.parse().unwrap_or(0))
            .collect::<Vec<u64>>()
    };
    parts(a) > parts(b)
}

/// What a published update is, from the website's answer to the updater: its notes, the
/// changelog of every version this install is behind by, and whether any of them is critical.
fn described(version: &str, notes: Option<&str>, raw: &Value) -> Value {
    json!({
        "version": version,
        "notes": notes.unwrap_or_default(),
        "changes": if raw["changes"].is_array() { raw["changes"].clone() } else { json!([]) },
        "critical": raw["critical"]
            .as_str()
            .filter(|kind| matches!(*kind, "security" | "functionality")),
    })
}

/// Asks tf21.net whether a newer version is out and records the answer. Nothing is installed
/// from here. A new version is announced once on the card and explained on the Update page;
/// one marked critical locks the app instead.
fn look(app: &AppHandle, core: &Shared) {
    let answer = tauri::async_runtime::block_on(async { Some(app.updater().ok()?.check().await) });
    match answer {
        Some(Ok(Some(update))) => {
            let next = described(&update.version, update.body.as_deref(), &update.raw_json);
            let heard = core.update.lock().unwrap()["version"] == next["version"];
            let (was_locked, critical) = (core.locked(), next["critical"].is_string());
            *core.update.lock().unwrap() = next.clone();
            core.save();
            if critical && !was_locked {
                show_main(app);
            } else if !critical && !heard {
                core.notices.lock().unwrap().push_back(json!({
                    "id": 0,
                    "kind": "update",
                    "title": format!("WARDEN {} is out", update.version),
                    "body": next["notes"],
                    "url": "",
                    "image": "",
                }));
                show_alert(app, seed_card(core));
            }
        }
        // Current after all: a lock left by an earlier answer is lifted.
        Some(Ok(None)) => {
            *core.update.lock().unwrap() = Value::Null;
            core.save();
        }
        // No answer, as when offline, changes nothing.
        _ => return,
    }
    let _ = app.emit("changed", ());
}

/// A file name as a header can carry it and the website's decodeURIComponent reads it back.
fn header_safe(name: &str) -> String {
    name.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The app's windows show the app's own pages and nothing else.
fn own_page(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "tauri" | "about")
        || matches!(url.host_str(), Some("tauri.localhost" | "localhost"))
}

pub fn toast(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The small always-on-top card, bottom right of the main screen. A seed call asks for it by
/// name; otherwise it stays up for as long as a notification is waiting to be read, and grows
/// to fit one with a picture.
pub fn show_alert(app: &AppHandle, visible: bool) {
    let Some(window) = app.get_webview_window("alert") else {
        return;
    };
    let notice = app
        .state::<Shared>()
        .notices
        .lock()
        .unwrap()
        .front()
        .cloned();
    if !visible && notice.is_none() {
        let _ = window.hide();
        return;
    }
    let pictured =
        !visible && notice.is_some_and(|n| n["image"].as_str().is_some_and(|i| !i.is_empty()));
    let _ = window.set_size(tauri::LogicalSize::new(
        440.0,
        if pictured { 430.0 } else { 236.0 },
    ));
    if let (Ok(Some(monitor)), Ok(size)) = (window.primary_monitor(), window.outer_size()) {
        let area = monitor.work_area();
        let _ = window.set_position(tauri::PhysicalPosition::new(
            area.position.x + area.size.width as i32 - size.width as i32 - 24,
            area.position.y + area.size.height as i32 - size.height as i32 - 24,
        ));
    }
    let _ = window.show();
}

fn muted(core: &Core, kind: &str) -> bool {
    core.me.lock().unwrap()["settings"]["mutes"]
        .as_array()
        .is_some_and(|m| m.iter().any(|k| k == kind))
}

/// Whether a seed call has the card: it outranks a notification.
fn seed_card(core: &Core) -> bool {
    matches!(
        core.seed.lock().unwrap().phase,
        "countdown" | "launching" | "closing"
    )
}

fn dispatch(app: &AppHandle, core: &Shared, event: &str, data: Value) {
    match event {
        "notify" => {
            if !muted(core, data["kind"].as_str().unwrap_or("")) {
                let sounds = core.me.lock().unwrap()["settings"]["sound"]
                    .as_bool()
                    .unwrap_or(true);
                if sounds && data["sound"].as_bool().unwrap_or(false) {
                    unsafe {
                        let _ = PlaySoundW(
                            PCWSTR(CHIME.as_ptr().cast()),
                            None,
                            SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
                        );
                    }
                }
                core.notices.lock().unwrap().push_back(data.clone());
                show_alert(app, seed_card(core));
            }
            let _ = app.emit("notify", data);
            let _ = app.emit("changed", ());
        }
        "update" => core.check_now.store(true, Ordering::Relaxed),
        // Staff deleted it: it leaves the card and the inbox.
        "recall" => {
            core.notices
                .lock()
                .unwrap()
                .retain(|n| n["id"] != data["id"]);
            show_alert(app, seed_card(core));
            let _ = app.emit("notify", data);
            let _ = app.emit("changed", ());
        }
        "me" => {
            let _ = core.refresh(app).and_then(|_| core.heartbeat());
        }
        "offer" => {
            let (app, core) = (app.clone(), core.clone());
            thread::spawn(move || seed::offer(&app, &core, data));
        }
        "end" => {
            let (app, core) = (app.clone(), core.clone());
            thread::spawn(move || seed::end(&app, &core, data));
        }
        _ => {}
    }
}

/// Holds the live line to the website open for as long as the app runs.
fn stream(app: AppHandle, core: Shared) {
    use std::io::{BufRead, BufReader};
    let mut wait = 2;
    loop {
        // Nothing reaches tf21.net until the terms are accepted, or while a critical update waits.
        while !core.accepted() || core.locked() {
            thread::sleep(Duration::from_secs(1));
        }
        let opened = core.refresh(&app).and_then(|_| {
            let token = core.token.lock().unwrap().clone().unwrap_or_default();
            ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(15))
                // The website sends a keepalive every 20 seconds; silence means the line is dead.
                .timeout_read(Duration::from_secs(60))
                .build()
                .get(&format!("{}/api/app/stream", core.site))
                .set("Authorization", &format!("Bearer {token}"))
                .set("Accept", "text/event-stream")
                .set("User-Agent", &format!("TF21-WARDEN/{VERSION}"))
                .call()
                .map_err(|_| "offline".to_string())
        });
        if let Ok(response) = opened {
            wait = 2;
            core.online.store(true, Ordering::Relaxed);
            let _ = core.heartbeat();
            core.report_consent();
            let _ = app.emit("changed", ());
            let (mut event, mut data) = (String::new(), String::new());
            for line in BufReader::new(response.into_reader()).lines() {
                let Ok(line) = line else { break };
                if core.locked() {
                    break;
                }
                if let Some(name) = line.strip_prefix("event: ") {
                    event = name.to_string();
                } else if let Some(chunk) = line.strip_prefix("data: ") {
                    data.push_str(chunk);
                } else if line.is_empty() && !event.is_empty() {
                    dispatch(
                        &app,
                        &core,
                        &event,
                        serde_json::from_str(&data).unwrap_or(Value::Null),
                    );
                    event.clear();
                    data.clear();
                }
            }
            core.online.store(false, Ordering::Relaxed);
            let _ = app.emit("changed", ());
        }
        thread::sleep(Duration::from_secs(wait));
        wait = (wait * 2).min(60);
    }
}

fn heartbeats(app: AppHandle, core: Shared) {
    loop {
        thread::sleep(Duration::from_secs(30));
        seed::watch(&app, &core);
        if core.online.load(Ordering::Relaxed) && core.accepted() {
            let _ = core.heartbeat();
        }
    }
}

/// Before the app shows anything else it asks whether a newer version is out, so that one
/// marked critical locks it from the start. No answer, as when offline, lets the app through.
fn boot_check(app: AppHandle, core: Shared) {
    look(&app, &core);
    *core.boot.lock().unwrap() = json!({ "status": "clear" });
    let _ = app.emit("changed", ());
}

fn updates(app: AppHandle, core: Shared) {
    loop {
        // Every three hours, or at once when the website says there is a new version.
        for _ in 0..(3 * 60 * 60 / 5) {
            if core.check_now.swap(false, Ordering::Relaxed) {
                break;
            }
            thread::sleep(Duration::from_secs(5));
        }
        if core.accepted() {
            look(&app, &core);
        }
    }
}

#[tauri::command]
fn state(app: AppHandle, core: State<'_, Shared>) -> Value {
    let (available, reason) = core.availability();
    json!({
        "version": VERSION,
        "site": core.site,
        "online": core.online.load(Ordering::Relaxed),
        "paused": core.paused.load(Ordering::Relaxed),
        "me": *core.me.lock().unwrap(),
        "seed": core.seed.lock().unwrap().view(),
        "available": available,
        "reason": reason,
        "steam_id": guard::steam_id(),
        "game_installed": guard::game_installed(),
        "autostart": app.autolaunch().is_enabled().unwrap_or(false),
        "update": *core.update.lock().unwrap(),
        "notice": core.notices.lock().unwrap().front(),
        "boot": *core.boot.lock().unwrap(),
        "consent": { "needed": !core.accepted(), "seeding": core.seeding_agreed() },
    })
}

/// Records the answer to the terms (always accepted to get here) and to the seeding agreement.
#[tauri::command]
fn set_consent(app: AppHandle, core: State<'_, Shared>, seeding: bool) {
    *core.consent.lock().unwrap() = json!({ "version": VERSION, "seeding": seeding });
    core.save();
    if core.online.load(Ordering::Relaxed) {
        let _ = core.heartbeat();
        core.report_consent();
    }
    let _ = app.emit("changed", ());
}

/// The notification on the card has been read: dismissed, or opened in the main window.
#[tauri::command]
fn dismiss_notice(app: AppHandle, core: State<'_, Shared>, open: bool) {
    let notice = core.notices.lock().unwrap().pop_front();
    show_alert(&app, seed_card(&core));
    if let (true, Some(notice)) = (open, notice) {
        show_main(&app);
        let _ = app.emit("goto", notice);
    }
    let _ = app.emit("changed", ());
}

#[tauri::command(async)]
fn api(
    core: State<'_, Shared>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    if !["GET", "POST", "PUT", "DELETE"].contains(&method.as_str()) {
        return Err("Unsupported method.".into());
    }
    // The seeding choice is recorded here first; the website is then sent its copy.
    let choice = body
        .as_ref()
        .filter(|_| method == "PUT" && path == "/api/app/settings")
        .map(|b| b["autoseed"].clone())
        .filter(Value::is_object);
    let before = choice.map(|c| core.set_autoseed(c));
    let result = core.call(&method, &path, body.as_ref());
    if let (Err(_), Some(before)) = (&result, before) {
        core.set_autoseed(before);
    }
    result
}

/// A screenshot picked in the report form, as base64, on its way to that report's evidence.
#[tauri::command(async)]
fn attach(
    core: State<'_, Shared>,
    name: String,
    mime: String,
    data: String,
) -> Result<Value, String> {
    use base64::Engine as _;
    if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime.as_str()) {
        return Err("Screenshots are PNG, JPEG, WebP or GIF pictures.".into());
    }
    let picture = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| "That picture could not be read.".to_string())?;
    if picture.len() > 8 * 1024 * 1024 {
        return Err("A screenshot can be up to 8 MB.".into());
    }
    core.attach(&name, &mime, &picture)
}

#[tauri::command(async)]
fn refresh(app: AppHandle, core: State<'_, Shared>) -> Result<(), String> {
    core.refresh(&app)?;
    core.heartbeat().map(|_| ())
}

#[tauri::command(async)]
fn link(core: State<'_, Shared>) -> Result<Value, String> {
    let made = core.call("POST", "/api/app/link", Some(&json!({})))?;
    if let Some(url) = made["url"].as_str().filter(|u| u.starts_with(&core.site)) {
        guard::open(url);
    }
    Ok(made)
}

#[tauri::command]
fn open_url(core: State<'_, Shared>, url: String) {
    let target = if url.starts_with('/') {
        format!("{}{}", core.site, url)
    } else {
        url
    };
    if target.starts_with("https://") || target.starts_with(&core.site) {
        guard::open(&target);
    }
}

#[tauri::command]
fn decide(core: State<'_, Shared>, action: String) {
    if action == "stop" {
        core.stop.store(true, Ordering::Relaxed);
    }
    core.seed.lock().unwrap().decision = Some(action);
}

#[tauri::command]
fn set_paused(app: AppHandle, core: State<'_, Shared>, paused: bool) {
    core.paused.store(paused, Ordering::Relaxed);
    core.save();
    if let Some(item) = app.try_state::<CheckMenuItem<tauri::Wry>>() {
        let _ = item.set_checked(paused);
    }
    let _ = app.emit("changed", ());
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let auto = app.autolaunch();
    if enabled {
        auto.enable()
    } else {
        auto.disable()
    }
    .map_err(|e| e.to_string())
}

/// Join from a button: hands Steam the join link and nothing more. No menus are driven, so it
/// needs somebody joinable already on the server; otherwise the caller shows the Server ID.
#[tauri::command(async)]
fn join_link(core: State<'_, Shared>, slug: String) -> Result<Value, String> {
    let found = core.call("GET", &format!("/api/servers/{slug}/join"), None)?;
    let url = found["url"]
        .as_str()
        .filter(|u| u.starts_with("steam://joinlobby/"));
    if let Some(url) = url {
        guard::open(url);
    }
    Ok(json!({ "opened": url.is_some(), "code": found["code"] }))
}

/// "Test auto-join" on the Seeding tab: the automatic join, run once on request.
#[tauri::command(async)]
fn test_join(app: AppHandle, core: State<'_, Shared>, slug: String) -> Result<(), String> {
    if !core.seeding_agreed() {
        return Err("Agree to the automatic seeding agreement first: it covers WARDEN driving the game's menus.".into());
    }
    seed::test(&app, core.inner(), &slug)
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Already up to date.")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}

/// Runs WARDEN's own uninstaller, the one Windows' Installed apps list runs, and gets out of
/// its way.
#[tauri::command]
fn uninstall(app: AppHandle) -> Result<(), String> {
    let uninstaller = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name("uninstall.exe");
    std::process::Command::new(uninstaller).spawn().map_err(|_| {
        "The uninstaller was not found. Remove TF21 WARDEN from Windows' Installed apps instead."
            .to_string()
    })?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn tray(app: &AppHandle, core: &Shared) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open WARDEN", true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(
        app,
        "pause",
        "Pause auto-seeding",
        true,
        core.paused.load(Ordering::Relaxed),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &quit])?;
    app.manage(pause.clone());
    let core = core.clone();
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("bundled icon").clone())
        .tooltip("TF21 WARDEN")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "pause" => {
                core.paused
                    .store(pause.is_checked().unwrap_or(false), Ordering::Relaxed);
                core.save();
                let _ = app.emit("changed", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    // A test run against another website may sit beside the installed app.
    let mut builder = tauri::Builder::default();
    if std::env::var("TF21_SITE").is_err() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }));
    }
    builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // A link in a news article opens in the browser; it never loads inside the app.
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("own-pages")
                .on_navigation(|_, url| own_page(url))
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            state,
            api,
            attach,
            refresh,
            link,
            open_url,
            decide,
            set_paused,
            set_autostart,
            join_link,
            test_join,
            install_update,
            dismiss_notice,
            set_consent,
            uninstall,
            quit
        ])
        .on_window_event(|window, event| {
            // Closing a window tucks the app into the tray; Quit lives in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // TF21_SITE points a test run at another website; it keeps its own state and never
            // registers itself to start with Windows.
            let test_site = std::env::var("TF21_SITE").ok();
            let mut dir = handle.path().app_config_dir()?;
            if test_site.is_some() {
                dir.push("test");
            }
            // Debug builds and test runs have no published version to compare with.
            let updating = !cfg!(debug_assertions) && test_site.is_none();
            let saved: Value = std::fs::read_to_string(dir.join("state.json"))
                .ok()
                .and_then(|text| serde_json::from_str(&text).ok())
                .unwrap_or(Value::Null);
            let first_run = saved.is_null();
            // A critical update that was never installed still locks this version.
            let kept = &saved["update"];
            let locked = kept["critical"].is_string()
                && newer(kept["version"].as_str().unwrap_or_default(), VERSION);
            let core: Shared = Arc::new(Core {
                site: test_site.clone().unwrap_or_else(|| DEFAULT_SITE.into()),
                dir,
                token: Mutex::new(saved["token"].as_str().map(String::from)),
                me: Mutex::new(Value::Null),
                online: AtomicBool::new(false),
                paused: AtomicBool::new(saved["paused"].as_bool().unwrap_or(false)),
                snoozed_until: Mutex::new(None),
                seed: Mutex::new(seed::Seed::default()),
                stop: AtomicBool::new(false),
                notices: Mutex::new(VecDeque::new()),
                consent: Mutex::new(saved["consent"].clone()),
                // A new install starts switched off, with the hours the website also starts from.
                autoseed: Mutex::new(if first_run {
                    json!({
                        "enabled": false,
                        "servers": [],
                        "days": [0, 1, 2, 3, 4, 5, 6],
                        "from": "09:00",
                        "to": "17:00",
                    })
                } else {
                    saved["autoseed"].clone()
                }),
                boot: Mutex::new(json!({ "status": if updating { "checking" } else { "clear" } })),
                update: Mutex::new(if locked { kept.clone() } else { Value::Null }),
                check_now: AtomicBool::new(false),
            });
            app.manage(core.clone());
            tray(&handle, &core)?;
            if first_run {
                if test_site.is_none() {
                    let _ = handle.autolaunch().enable();
                }
                core.save();
            }
            // Terms waiting to be read, or a lock, open the window even on a quiet start.
            if !core.accepted() || core.locked() || !std::env::args().any(|a| a == "--hidden") {
                show_main(&handle);
            }
            thread::spawn({
                let (handle, core) = (handle.clone(), core.clone());
                move || stream(handle, core)
            });
            thread::spawn({
                let (handle, core) = (handle.clone(), core.clone());
                move || heartbeats(handle, core)
            });
            if updating {
                thread::spawn({
                    let (handle, core) = (handle.clone(), core.clone());
                    move || boot_check(handle, core)
                });
                thread::spawn(move || updates(handle, core));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("TF21 WARDEN failed to start")
        .run(|_, event| {
            // The tray keeps the app alive after its windows are hidden.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_seeding_choice_on_this_pc_outranks_the_websites_copy() {
        let mut mine = json!({ "enabled": false, "servers": [] });
        let mut me = json!({ "settings": { "autoseed": { "enabled": true }, "sound": true } });
        assert!(!own_autoseed(&mut mine, &mut me));
        assert_eq!(me["settings"]["autoseed"], mine);
        assert_eq!(me["settings"]["sound"], true);
        assert_eq!(mine["enabled"], false);
    }

    #[test]
    fn an_install_with_no_choice_of_its_own_takes_the_websites_once() {
        let mut mine = Value::Null;
        let mut me = json!({ "settings": { "autoseed": { "enabled": true } } });
        assert!(own_autoseed(&mut mine, &mut me));
        assert_eq!(mine["enabled"], true);
        me["settings"]["autoseed"]["enabled"] = json!(false);
        assert!(!own_autoseed(&mut mine, &mut me));
        assert_eq!(me["settings"]["autoseed"]["enabled"], true);
    }

    #[test]
    fn a_file_name_travels_in_a_header_whatever_is_in_it() {
        assert_eq!(header_safe("clip_01-final.png"), "clip_01-final.png");
        assert_eq!(header_safe("my shot (2).png"), "my%20shot%20%282%29.png");
        assert_eq!(header_safe("écran\r\n.png"), "%C3%A9cran%0D%0A.png");
    }

    #[test]
    fn versions_compare_by_their_numbers() {
        assert!(newer("1.10.0", "1.9.9"));
        assert!(newer("2.0.0", "1.99.99"));
        assert!(!newer("1.2.3", "1.2.3"));
        assert!(!newer("1.2.2", "1.2.3"));
        assert!(!newer("", "1.2.3"));
    }

    #[test]
    fn an_update_is_optional_unless_the_website_names_it_critical() {
        let changes = json!([{ "version": "1.3.0", "title": "Faster joins" }]);
        let plain = described("1.3.0", Some("Notes"), &json!({ "changes": changes }));
        assert_eq!(plain["critical"], Value::Null);
        assert_eq!(plain["changes"], changes);
        assert_eq!(plain["notes"], "Notes");
        let odd = described(
            "1.3.0",
            None,
            &json!({ "critical": "because", "changes": "x" }),
        );
        assert_eq!(odd["critical"], Value::Null);
        assert_eq!(odd["changes"], json!([]));
        for kind in ["security", "functionality"] {
            assert_eq!(
                described("1.3.0", None, &json!({ "critical": kind }))["critical"],
                kind
            );
        }
    }

    #[test]
    fn only_the_apps_own_pages_load_in_its_windows() {
        let page = |url: &str| own_page(&url.parse().unwrap());
        assert!(page("http://tauri.localhost/index.html"));
        assert!(page("http://tauri.localhost/alert.html"));
        assert!(page("about:blank"));
        assert!(!page("https://tf21.net/blog/x"));
        assert!(!page("https://example.com/"));
    }
}
