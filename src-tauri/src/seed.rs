//! One seed call on this PC: countdown, join, and the closing countdown when seeding is over.
use crate::{driver, guard, show_alert, toast, Core, Shared};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SNOOZE: Duration = Duration::from_secs(60 * 60);
/// However short a countdown the website asks for, there is always this long to say no.
const SHORTEST_COUNTDOWN: u64 = 15;

fn seconds(asked: &Value) -> u64 {
    asked.as_u64().unwrap_or(60).max(SHORTEST_COUNTDOWN)
}

pub struct Seed {
    /// idle | countdown | launching | seeding | closing
    pub phase: &'static str,
    pub offer: Value,
    pub step: String,
    pub ends: Option<Instant>,
    pub decision: Option<String>,
    /// The app started the game itself, so it may close it again.
    pub launched: bool,
}

impl Default for Seed {
    fn default() -> Self {
        Seed {
            phase: "idle",
            offer: Value::Null,
            step: String::new(),
            ends: None,
            decision: None,
            launched: false,
        }
    }
}

impl Seed {
    pub fn view(&self) -> Value {
        json!({
            "phase": self.phase,
            "server": self.offer["server"],
            "test": self.offer["test"],
            "step": self.step,
            "seconds": self.ends.map(|e| e.saturating_duration_since(Instant::now()).as_secs()),
        })
    }
}

fn set(app: &AppHandle, core: &Core, change: impl FnOnce(&mut Seed)) {
    change(&mut core.seed.lock().unwrap());
    let _ = app.emit("changed", ());
}

fn idle(app: &AppHandle, core: &Core) {
    set(app, core, |s| *s = Seed::default());
    show_alert(app, false);
}

fn respond(core: &Core, offer: &Value, status: &str, reason: &str) {
    if let Some(id) = offer["id"].as_str() {
        let _ = core.call(
            "POST",
            &format!("/api/app/offers/{id}"),
            Some(&json!({ "status": status, "reason": reason })),
        );
    }
}

/// Runs a countdown the user can answer. Returns their decision, or None when it ran out.
fn countdown(app: &AppHandle, core: &Core, phase: &'static str, seconds: u64) -> Option<String> {
    set(app, core, |s| {
        s.phase = phase;
        s.decision = None;
        s.ends = Some(Instant::now() + Duration::from_secs(seconds));
    });
    show_alert(app, true);
    loop {
        sleep(Duration::from_millis(250));
        let mut seed = core.seed.lock().unwrap();
        if let Some(decision) = seed.decision.take() {
            return Some(decision);
        }
        if seed.ends.is_none_or(|e| Instant::now() >= e) {
            return None;
        }
    }
}

fn server_name(offer: &Value) -> String {
    offer["server"]["name"]
        .as_str()
        .unwrap_or("the server")
        .to_string()
}

fn join(app: &AppHandle, core: &Core, offer: &Value) -> Result<(), &'static str> {
    let launched = guard::game_pid().is_none();
    core.stop.store(false, Ordering::Relaxed);
    set(app, core, |s| {
        s.phase = "launching";
        s.launched = launched;
        s.ends = None;
    });
    let server_id = offer["server"]["server_id"].as_str().unwrap_or_default();
    let result = driver::join(server_id, &core.stop, |step| {
        set(app, core, |s| s.step = step.into())
    });
    if result.is_err() && launched {
        guard::kill_game();
    }
    result
}

pub fn offer(app: &AppHandle, core: &Shared, offer: Value) {
    let (available, reason) = core.availability();
    if !available {
        return respond(core, &offer, "declined", reason);
    }
    // Only for a server this PC was opted in to, whatever the website believes.
    if !core.seeds(offer["server"]["slug"].as_str().unwrap_or_default()) {
        return respond(core, &offer, "declined", "off");
    }
    set(app, core, |s| s.offer = offer.clone());
    let name = server_name(&offer);
    toast(
        app,
        "Seed call",
        &format!("{name} needs seeders. Joining in a minute unless you cancel."),
    );
    match countdown(app, core, "countdown", seconds(&offer["countdown"])).as_deref() {
        Some("snooze") => {
            *core.snoozed_until.lock().unwrap() = Some(Instant::now() + SNOOZE);
            respond(core, &offer, "declined", "snoozed");
            return idle(app, core);
        }
        Some("join") | None => {}
        // Cancelled here, or withdrawn by the website.
        Some(other) => {
            if other != "withdrawn" {
                respond(core, &offer, "declined", "user");
            }
            return idle(app, core);
        }
    }
    // A minute is long enough for somebody to have started something else.
    if guard::game_pid().is_some() || guard::busy() {
        respond(core, &offer, "declined", "busy");
        return idle(app, core);
    }
    respond(core, &offer, "accepted", "");
    match join(app, core, &offer) {
        Ok(()) => {
            respond(core, &offer, "launched", "");
            // Leave "On the server" up long enough to be read.
            sleep(Duration::from_secs(5));
            set(app, core, |s| s.phase = "seeding");
            show_alert(app, false);
        }
        Err(reason) => {
            respond(core, &offer, "failed", reason);
            if reason != "stopped" {
                toast(
                    app,
                    "Could not join",
                    &format!("WARDEN could not get onto {name} this time."),
                );
            }
            idle(app, core);
        }
    }
}

/// The website says this seed call is over.
pub fn end(app: &AppHandle, core: &Shared, data: Value) {
    let (phase, offer, launched) = {
        let seed = core.seed.lock().unwrap();
        (seed.phase, seed.offer.clone(), seed.launched)
    };
    if offer["id"] != data["offer_id"] {
        return;
    }
    match phase {
        "countdown" => core.seed.lock().unwrap().decision = Some("withdrawn".into()),
        "launching" => core.stop.store(true, Ordering::Relaxed),
        "seeding" => {
            if !launched || guard::game_pid().is_none() {
                return idle(app, core);
            }
            toast(
                app,
                "Seeding complete",
                "Thank you. WARDOGS will close in a minute unless you choose to stay.",
            );
            let stay = countdown(app, core, "closing", seconds(&data["countdown"])).as_deref()
                == Some("stay");
            if !stay {
                guard::kill_game();
            }
            respond(core, &offer, if stay { "stayed" } else { "closed" }, "");
            idle(app, core);
        }
        _ => {}
    }
}

/// Somebody who quits the game mid-seed has left; tell the website so it can call someone else.
pub fn watch(app: &AppHandle, core: &Shared) {
    let (phase, offer) = {
        let seed = core.seed.lock().unwrap();
        (seed.phase, seed.offer.clone())
    };
    if phase == "seeding" && guard::game_pid().is_none() {
        respond(core, &offer, "left", "");
        idle(app, core);
    }
}

/// "Test auto-join" from the settings screen: the same walk, on request, with nothing reported.
pub fn test(app: &AppHandle, core: &Shared, slug: &str) -> Result<(), String> {
    if core.seed.lock().unwrap().phase != "idle" {
        return Err("WARDEN is already busy with a seed call.".into());
    }
    if !guard::game_installed() {
        return Err("WARDOGS is not installed on this PC.".into());
    }
    let found = core.call("GET", &format!("/api/servers/{slug}/join"), None)?;
    let server_id = found["code"]
        .as_str()
        .ok_or("That server has not published its Server ID.")?;
    let offer = json!({
        "test": true,
        "server": { "slug": slug, "name": found["server"]["name"], "server_id": server_id },
    });
    set(app, core, |s| s.offer = offer.clone());
    show_alert(app, true);
    let result = join(app, core, &offer);
    if result.is_ok() {
        sleep(Duration::from_secs(5));
    }
    idle(app, core);
    result.map_err(|reason| match reason {
        "stopped" => "Stopped.".to_string(),
        "launch_timeout" => "WARDOGS did not start. Is Steam signed in, and the game up to date?".to_string(),
        "join_timeout" => "WARDEN could not get from the game's menus onto the server.".to_string(),
        "join_refused" => "The game would not let you into the server. It may be full.".to_string(),
        "no_ocr" => "Auto-join reads the game's screen, and this PC has no Windows text recognition language installed.".to_string(),
        "server_not_found" => "The game could not find the server.".to_string(),
        "bad_server_id" => "The website sent something that is not a Server ID, so nothing was typed.".to_string(),
        other => format!("Auto-join failed ({other})."),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_countdown_is_never_shorter_than_the_floor() {
        assert_eq!(seconds(&json!(0)), SHORTEST_COUNTDOWN);
        assert_eq!(seconds(&json!(5)), SHORTEST_COUNTDOWN);
        assert_eq!(seconds(&json!(90)), 90);
        assert_eq!(seconds(&Value::Null), 60);
    }
}
