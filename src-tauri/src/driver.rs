//! Walks WARDOGS from a cold start onto a server. The game has no join link that works on an
//! empty server, so this uses the in-game Join by ID box. It reads the game window with Windows'
//! own OCR and acts on what the screen says, whatever the resolution:
//! title screen -> DEPLOY -> COMMUNITY -> JOIN BY ID -> paste -> LOOKUP -> JOIN MATCH.
use crate::guard;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::sleep;
use std::time::{Duration, Instant};
use windows::core::BOOL;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
    GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, mouse_event, KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MOVE, VK_CONTROL, VK_MENU, VK_SPACE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetClientRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    SetCursorPos, SetForegroundWindow, ShowWindow, SW_RESTORE,
};

const LAUNCH_TIMEOUT: Duration = Duration::from_secs(240);
const JOIN_TIMEOUT: Duration = Duration::from_secs(300);
/// PW_CLIENTONLY | PW_RENDERFULLCONTENT: the game's own picture, even behind other windows.
const PRINT_FLAGS: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(3);

#[derive(Debug, Clone, PartialEq)]
pub struct Word {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Capitals and digits only: OCR is unsure about case and punctuation, never about letters.
pub fn tidy(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

/// The centre of the first run of words on a line that spells `phrase`.
pub fn find(lines: &[Vec<Word>], phrase: &str) -> Option<(f32, f32)> {
    let wanted = tidy(phrase);
    for line in lines {
        for start in 0..line.len() {
            let mut joined = String::new();
            for end in start..line.len() {
                joined.push_str(&tidy(&line[end].text));
                if joined == wanted {
                    let (first, last) = (&line[start], &line[end]);
                    return Some((
                        (first.x + last.x + last.w) / 2.0,
                        (first.y.min(last.y) + (first.y + first.h).max(last.y + last.h)) / 2.0,
                    ));
                }
                if !wanted.starts_with(&joined) {
                    break;
                }
            }
        }
    }
    None
}

#[derive(Debug, PartialEq)]
pub enum Screen {
    Title,
    MainMenu(f32, f32),
    Deploy(f32, f32),
    Browser(f32, f32),
    IdBox(f32, f32),
    Confirm(f32, f32),
    InMatch,
    /// The server is full and the game is holding a place in its queue.
    Queued,
    Unknown,
}

/// Which screen the game is on, and where to click to move on from it. Dialogs are checked
/// first: the screen behind one is still partly legible.
pub fn read(lines: &[Vec<Word>]) -> Screen {
    let at = |phrase| find(lines, phrase);
    if at("SELECT FACTION").is_some() || at("LEAVE MATCH").is_some() {
        return Screen::InMatch;
    }
    // The queue banner is small print, and OCR reads its Q as an O as often as not.
    if lines
        .iter()
        .flatten()
        .any(|w| tidy(&w.text).contains("UEUE"))
    {
        return Screen::Queued;
    }
    if at("JOIN GAME SERVER").is_some() {
        if let Some((x, y)) = at("JOIN MATCH") {
            return Screen::Confirm(x, y);
        }
    }
    if at("ENTER SERVER ID").is_some() || at("FIND SERVER").is_some() {
        if let Some((x, y)) = at("LOOKUP") {
            return Screen::IdBox(x, y);
        }
    }
    if let Some((x, y)) = at("JOIN BY ID") {
        return Screen::Browser(x, y);
    }
    if at("OFFICIAL").is_some() {
        if let Some((x, y)) = at("COMMUNITY") {
            return Screen::Deploy(x, y);
        }
    }
    if at("FIRING RANGE").is_some() {
        if let Some((x, y)) = at("DEPLOY") {
            return Screen::MainMenu(x, y);
        }
    }
    if at("PRESS ANY BUTTON").is_some() {
        return Screen::Title;
    }
    Screen::Unknown
}

struct Game {
    hwnd: HWND,
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

/// The game's main window, by its process: its title carries stray spaces, so it is not looked
/// up by name.
fn game() -> Option<Game> {
    struct Search {
        pid: u32,
        found: Option<HWND>,
    }
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let search = &mut *(data.0 as *mut Search);
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut class = [0u16; 64];
        let len = GetClassNameW(hwnd, &mut class) as usize;
        if pid == search.pid
            && IsWindowVisible(hwnd).as_bool()
            && String::from_utf16_lossy(&class[..len]) == "UnrealWindow"
        {
            search.found = Some(hwnd);
            return BOOL(0);
        }
        BOOL(1)
    }
    unsafe {
        let mut search = Search {
            pid: guard::game_pid()?,
            found: None,
        };
        let _ = EnumWindows(Some(each), LPARAM(&mut search as *mut Search as isize));
        let hwnd = search.found?;
        // Launched from the tray, the game can come up minimised, with no client area to read.
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            sleep(Duration::from_secs(1));
        }
        let mut rect = RECT::default();
        GetClientRect(hwnd, &mut rect).ok()?;
        let mut origin = POINT::default();
        if !ClientToScreen(hwnd, &mut origin).as_bool() || rect.bottom < 400 {
            return None;
        }
        Some(Game {
            hwnd,
            left: origin.x,
            top: origin.y,
            width: rect.right,
            height: rect.bottom,
        })
    }
}

impl Game {
    /// The window's picture as BGRA rows, top first.
    fn capture(&self) -> Option<Vec<u8>> {
        unsafe {
            let screen = GetDC(None);
            let dc = CreateCompatibleDC(Some(screen));
            let bitmap = CreateCompatibleBitmap(screen, self.width, self.height);
            let before = SelectObject(dc, bitmap.into());
            let printed = PrintWindow(self.hwnd, dc, PRINT_FLAGS).as_bool();
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: self.width,
                    biHeight: -self.height,
                    biPlanes: 1,
                    biBitCount: 32,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut pixels = vec![0u8; (self.width * self.height * 4) as usize];
            let rows = GetDIBits(
                dc,
                bitmap,
                0,
                self.height as u32,
                Some(pixels.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(dc, before);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(dc);
            ReleaseDC(None, screen);
            (printed && rows > 0).then_some(pixels)
        }
    }

    fn lines(&self, engine: &OcrEngine) -> windows::core::Result<Vec<Vec<Word>>> {
        let Some(pixels) = self.capture() else {
            return Ok(Vec::new());
        };
        let writer = DataWriter::new()?;
        writer.WriteBytes(&pixels)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
            &writer.DetachBuffer()?,
            BitmapPixelFormat::Bgra8,
            self.width,
            self.height,
        )?;
        let mut lines = Vec::new();
        for line in engine.RecognizeAsync(&bitmap)?.join()?.Lines()? {
            let mut words = Vec::new();
            for word in line.Words()? {
                let rect = word.BoundingRect()?;
                words.push(Word {
                    text: word.Text()?.to_string(),
                    x: rect.X,
                    y: rect.Y,
                    w: rect.Width,
                    h: rect.Height,
                });
            }
            lines.push(words);
        }
        Ok(lines)
    }

    fn focus(&self) {
        unsafe {
            // Windows only lets a background app take the foreground straight after input,
            // so a tap of Alt comes first.
            keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
            let _ = SetForegroundWindow(self.hwnd);
        }
        sleep(Duration::from_millis(500));
    }
    fn click(&self, x: f32, y: f32) {
        let (x, y) = (self.left + x.round() as i32, self.top + y.round() as i32);
        self.focus();
        unsafe {
            // The menu only registers a click after it has seen the pointer move.
            let _ = SetCursorPos(x - 5, y - 5);
            sleep(Duration::from_millis(150));
            mouse_event(MOUSEEVENTF_MOVE, 5, 5, 0, 0);
            sleep(Duration::from_millis(300));
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            sleep(Duration::from_millis(80));
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        }
    }
    fn key(&self, keys: &[u8]) {
        self.focus();
        unsafe {
            for k in keys {
                keybd_event(*k, 0, Default::default(), 0);
            }
            sleep(Duration::from_millis(80));
            for k in keys.iter().rev() {
                keybd_event(*k, 0, KEYEVENTF_KEYUP, 0);
            }
        }
    }
    fn paste(&self, text: &str) -> Result<(), &'static str> {
        let mut clipboard = arboard::Clipboard::new().map_err(|_| "clipboard")?;
        let before = clipboard.get_text().ok();
        clipboard.set_text(text).map_err(|_| "clipboard")?;
        self.key(&[VK_CONTROL.0 as u8, b'V']);
        sleep(Duration::from_millis(500));
        if let Some(before) = before {
            let _ = clipboard.set_text(before);
        }
        Ok(())
    }
}

fn engine() -> Option<OcrEngine> {
    Language::CreateLanguage(&"en-US".into())
        .and_then(|english| OcrEngine::TryCreateFromLanguage(&english))
        .or_else(|_| OcrEngine::TryCreateFromUserProfileLanguages())
        .ok()
}

/// Launches the game if needed and joins the server with this Server ID. `Ok` means the game
/// itself showed it is in the match, or queued for it; the website confirms the arrival from the
/// server's roster.
pub fn join(server_id: &str, stop: &AtomicBool, step: impl Fn(&str)) -> Result<(), &'static str> {
    let engine = engine().ok_or("no_ocr")?;
    step("launching");
    if guard::game_pid().is_none() {
        guard::open(&format!("steam://run/{}", guard::APP_ID));
    }
    let start = Instant::now();
    let (mut window_at, mut lookups, mut confirms) = (None, 0, 0);
    step("window");
    loop {
        if stop.load(Ordering::Relaxed) {
            return Err("stopped");
        }
        let Some(g) = game() else {
            if start.elapsed() > LAUNCH_TIMEOUT {
                return Err("launch_timeout");
            }
            sleep(Duration::from_secs(1));
            continue;
        };
        if window_at.get_or_insert_with(Instant::now).elapsed() > JOIN_TIMEOUT {
            return Err("join_timeout");
        }
        match read(&g.lines(&engine).map_err(|_| "ocr_failed")?) {
            Screen::InMatch => {
                step("joined");
                return Ok(());
            }
            // The game joins by itself when the place comes up; there is nothing left to press.
            Screen::Queued => {
                step("queued");
                return Ok(());
            }
            Screen::Confirm(x, y) => {
                step("joining");
                confirms += 1;
                if confirms > 4 {
                    return Err("join_refused");
                }
                g.click(x, y);
                sleep(Duration::from_secs(6));
            }
            Screen::IdBox(x, y) => {
                // Still here after a lookup: the game did not find the server.
                lookups += 1;
                if lookups > 3 {
                    return Err("server_not_found");
                }
                step("server_id");
                g.paste(server_id)?;
                step("lookup");
                g.click(x, y);
                sleep(Duration::from_secs(4));
            }
            // Back at the browser after pressing Join Match: the server was full and the game
            // has queued, whether or not the banner could be read.
            Screen::Browser(..) if confirms > 0 => {
                step("queued");
                return Ok(());
            }
            Screen::Browser(x, y) => {
                step("join_by_id");
                g.click(x, y);
                sleep(Duration::from_secs(2));
            }
            Screen::Deploy(x, y) => {
                step("community");
                g.click(x, y);
                sleep(Duration::from_secs(3));
            }
            Screen::MainMenu(x, y) => {
                step("deploy");
                g.click(x, y);
                sleep(Duration::from_secs(2));
            }
            Screen::Title => {
                step("menu");
                g.key(&[VK_SPACE.0 as u8]);
                sleep(Duration::from_secs(3));
            }
            // Loading, or a screen this does not know: look again.
            Screen::Unknown => sleep(Duration::from_millis(1500)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(y: f32, words: &[(&str, f32)]) -> Vec<Word> {
        words
            .iter()
            .map(|(text, x)| Word {
                text: text.to_string(),
                x: *x,
                y,
                w: 80.0,
                h: 20.0,
            })
            .collect()
    }

    #[test]
    fn finds_a_phrase_across_words_whatever_the_case_and_punctuation() {
        let lines = vec![
            line(100.0, &[("// Server", 0.0), ("Browser", 100.0)]),
            line(
                1340.0,
                &[
                    ("REFRESH", 100.0),
                    ("Join", 200.0),
                    ("By", 300.0),
                    ("ID", 400.0),
                ],
            ),
        ];
        assert_eq!(find(&lines, "JOIN BY ID"), Some((340.0, 1350.0)));
        assert_eq!(find(&lines, "SERVER BROWSER"), Some((90.0, 110.0)));
        assert_eq!(find(&lines, "JOIN MATCH"), None);
    }

    #[test]
    fn reads_each_screen_and_prefers_the_dialog_on_top() {
        let title = vec![line(
            1150.0,
            &[
                ("PRESS", 0.0),
                ("ANY", 90.0),
                ("BUTTON", 180.0),
                ("TO", 270.0),
                ("START", 360.0),
            ],
        )];
        assert_eq!(read(&title), Screen::Title);
        let menu = vec![
            line(40.0, &[("PLAY", 440.0), ("UNLOCK", 640.0)]),
            line(1050.0, &[("DEPLOY", 430.0)]),
            line(1190.0, &[("FIRING", 300.0), ("RANGE", 390.0)]),
        ];
        assert_eq!(read(&menu), Screen::MainMenu(470.0, 1060.0));
        let deploy = vec![
            line(40.0, &[("DEPLOY", 300.0)]),
            line(1125.0, &[("OFFICIAL", 370.0), ("COMMUNITY", 930.0)]),
        ];
        assert_eq!(read(&deploy), Screen::Deploy(970.0, 1135.0));
        let mut browser = vec![
            line(56.0, &[("COMMUNITY", 300.0)]),
            line(1355.0, &[("JOIN", 140.0), ("BY", 230.0), ("ID", 320.0)]),
            line(1160.0, &[("JOIN", 1900.0), ("MATCH", 2000.0)]),
        ];
        assert_eq!(read(&browser), Screen::Browser(270.0, 1365.0));
        browser.push(line(576.0, &[("FIND", 1040.0), ("SERVER", 1130.0)]));
        browser.push(line(864.0, &[("LOOKUP", 1400.0)]));
        assert_eq!(read(&browser), Screen::IdBox(1440.0, 874.0));
        let confirm = vec![
            line(
                570.0,
                &[("JOIN", 1160.0), ("GAME", 1250.0), ("SERVER?", 1340.0)],
            ),
            line(
                824.0,
                &[("CANCEL", 1400.0), ("JOIN", 1710.0), ("MATCH", 1800.0)],
            ),
            line(1160.0, &[("JOIN", 1900.0), ("MATCH", 2000.0)]),
        ];
        assert_eq!(read(&confirm), Screen::Confirm(1795.0, 834.0));
        let faction = vec![line(
            580.0,
            &[("//", 1200.0), ("SELECT", 1240.0), ("FACTION", 1330.0)],
        )];
        assert_eq!(read(&faction), Screen::InMatch);
        browser.push(line(
            1053.0,
            &[
                ("IN", 720.0),
                ("SERVER", 745.0),
                ("OUEUE...", 800.0),
                ("Position", 870.0),
            ],
        ));
        assert_eq!(read(&browser), Screen::Queued);
        assert_eq!(read(&[]), Screen::Unknown);
    }

    /// Run by hand with the game open: `cargo test --lib live -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_screen() {
        let g = game().expect("the game window");
        let lines = g.lines(&engine().expect("an OCR engine")).unwrap();
        for words in &lines {
            let row: Vec<_> = words
                .iter()
                .map(|w| format!("{}@{:.0},{:.0}", w.text, w.x, w.y))
                .collect();
            println!("{}", row.join("  "));
        }
        println!("{}x{} -> {:?}", g.width, g.height, read(&lines));
    }
}
