//! What this PC is doing right now: the checks that decide whether an auto-join may go ahead.
use chrono::{Datelike, Local, Timelike};
use serde_json::Value;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

pub const APP_ID: u32 = 1867240;
pub const GAME_EXE: &str = "WardogsClient-Win64-Shipping.exe";

pub fn game_pid() -> Option<u32> {
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut found = None;
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(0);
                if String::from_utf16_lossy(&entry.szExeFile[..len]).eq_ignore_ascii_case(GAME_EXE)
                {
                    found = Some(entry.th32ProcessID);
                    break;
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        found
    }
}

pub fn kill_game() {
    if let Some(pid) = game_pid() {
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) {
                let _ = TerminateProcess(handle, 0);
                let _ = CloseHandle(handle);
            }
        }
    }
}

/// Another game, a full-screen app or a presentation has the screen.
pub fn busy() -> bool {
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => {
            state == QUNS_BUSY
                || state == QUNS_RUNNING_D3D_FULL_SCREEN
                || state == QUNS_PRESENTATION_MODE
        }
        Err(_) => false,
    }
}

fn steam_key() -> Option<RegKey> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Valve\Steam")
        .ok()
}

/// SteamID64 of the account signed in to the running Steam client, if any.
pub fn steam_id() -> Option<String> {
    let active: u32 = steam_key()?
        .open_subkey("ActiveProcess")
        .ok()?
        .get_value("ActiveUser")
        .ok()?;
    (active != 0).then(|| (76561197960265728u64 + active as u64).to_string())
}

pub fn game_installed() -> bool {
    let Some(path) = steam_key().and_then(|k| k.get_value::<String, _>("SteamPath").ok()) else {
        return false;
    };
    std::fs::read_to_string(format!("{path}/steamapps/libraryfolders.vdf"))
        .map(|text| text.contains(&format!("\"{APP_ID}\"")))
        .unwrap_or(false)
}

pub fn open(target: &str) {
    let _ = tauri_plugin_opener::open_url(target, None::<&str>);
}

fn minutes(text: &str) -> Option<u32> {
    let (h, m) = text.split_once(':')?;
    Some(h.parse::<u32>().ok()? * 60 + m.parse::<u32>().ok()?)
}

/// `{days: [0-6, Monday first], from: "HH:MM", to: "HH:MM"}` against a local weekday and minute.
/// A window whose end is not after its start runs past midnight and belongs to its starting day.
pub fn within(hours: &Value, weekday: u32, minute: u32) -> bool {
    let days: Vec<u32> = hours["days"]
        .as_array()
        .map(|d| {
            d.iter()
                .filter_map(|v| v.as_u64().map(|n| n as u32))
                .collect()
        })
        .unwrap_or_default();
    let (Some(from), Some(to)) = (
        hours["from"].as_str().and_then(minutes),
        hours["to"].as_str().and_then(minutes),
    ) else {
        return false;
    };
    if from < to {
        return days.contains(&weekday) && minute >= from && minute < to;
    }
    (days.contains(&weekday) && minute >= from)
        || (days.contains(&((weekday + 6) % 7)) && minute < to)
}

pub fn within_now(hours: &Value) -> bool {
    let now = Local::now();
    within(
        hours,
        now.weekday().num_days_from_monday(),
        now.hour() * 60 + now.minute(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn day_window() {
        let h = json!({"days": [0, 1], "from": "09:00", "to": "17:00"});
        assert!(within(&h, 0, 9 * 60));
        assert!(within(&h, 1, 16 * 60 + 59));
        assert!(!within(&h, 1, 17 * 60));
        assert!(!within(&h, 2, 10 * 60));
    }

    #[test]
    fn overnight_window_belongs_to_its_starting_day() {
        let h = json!({"days": [4], "from": "22:00", "to": "06:00"});
        assert!(within(&h, 4, 23 * 60));
        assert!(within(&h, 5, 5 * 60));
        assert!(!within(&h, 4, 5 * 60));
        assert!(!within(&h, 5, 23 * 60));
    }

    #[test]
    fn broken_settings_never_match() {
        assert!(!within(&json!({}), 0, 600));
        assert!(!within(
            &json!({"days": [0], "from": "x", "to": "17:00"}),
            0,
            600
        ));
    }
}
