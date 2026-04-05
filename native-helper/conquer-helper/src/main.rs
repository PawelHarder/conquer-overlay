//! Conquer Market Overlay — automation helper (Linux/X11)
//!
//! Speaks the same newline-delimited JSON stdio protocol as
//! conquer-helper-spike.ps1 so the Electron host needs no changes.
//!
//! Protocol summary
//! ─────────────────
//! Outgoing (helper → host):
//!   {"type":"hello",          "payload":{...}}
//!   {"type":"heartbeat",      "payload":{...}}
//!   {"type":"result",         "requestId":"...", "payload":{...}}
//!   {"type":"error",          "requestId":"...", "payload":{"code":"...","message":"..."}}
//!   {"type":"log",            "payload":{"message":"...","details":{...}}}
//!   {"type":"target-status",  "payload":{...}}
//!   {"type":"runtime-applied","payload":{...}}
//!   {"type":"hotkey-triggered","payload":{...}}
//!
//! Incoming (host → helper):
//!   heartbeat, configure-session, set-target, focus-target,
//!   set-runtime-config, register-hotkeys, set-toggle-state,
//!   perform-test-action, perform-emergency-release, emergency-stop, shutdown

use std::collections::HashMap;
use std::io::{self, BufRead, BufWriter, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

// ── Timestamp helpers ─────────────────────────────────────────────────────────

fn iso_now() -> String {
    // Produce a simple ISO-8601 UTC string without external crates.
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // Approximate calendar date (good enough for logging).
    let (y, mo, d) = days_to_ymd(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    let mut y = 1970u64;
    loop {
        let dy = if is_leap(y) { 366 } else { 365 };
        if days < dy { break; }
        days -= dy;
        y += 1;
    }
    let months = [31u64, if is_leap(y) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mo = 1u64;
    for &dm in &months {
        if days < dm { break; }
        days -= dm;
        mo += 1;
    }
    (y, mo, days + 1)
}

fn is_leap(y: u64) -> bool { y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) }

// ── Output (locked stdout) ────────────────────────────────────────────────────

type Out = Arc<Mutex<BufWriter<io::Stdout>>>;

fn send(out: &Out, msg: Value) {
    let mut line = serde_json::to_string(&msg).unwrap_or_default();
    line.push('\n');
    let mut w = out.lock().unwrap();
    let _ = w.write_all(line.as_bytes());
    let _ = w.flush();
}

fn send_result(out: &Out, request_id: Option<&str>, payload: Value) {
    let mut m = json!({"type": "result", "payload": payload});
    if let Some(id) = request_id {
        m["requestId"] = json!(id);
    }
    send(out, m);
}

fn send_error(out: &Out, request_id: Option<&str>, code: &str, message: &str) {
    let mut m = json!({
        "type": "error",
        "payload": {"code": code, "message": message}
    });
    if let Some(id) = request_id {
        m["requestId"] = json!(id);
    }
    send(out, m);
}

fn send_log(out: &Out, message: &str, details: Option<Value>) {
    let payload = match details {
        Some(d) => json!({"message": message, "details": d}),
        None => json!({"message": message}),
    };
    send(out, json!({"type": "log", "payload": payload}));
}

fn send_target_status(out: &Out, status: &Value) {
    send(out, json!({"type": "target-status", "payload": status}));
}

// ── Config state ──────────────────────────────────────────────────────────────

#[derive(Clone)]
struct Target {
    window_title_pattern: String,
    require_foreground_for_input: bool,
}

impl Default for Target {
    fn default() -> Self {
        Self {
            window_title_pattern: "ClassicConquer".into(),
            require_foreground_for_input: true,
        }
    }
}

#[derive(Clone)]
struct Runtime {
    master_enabled: bool,
    left_clicker_enabled: bool,
    right_clicker_enabled: bool,
    f7_enabled: bool,
    shift_held_enabled: bool,
    ctrl_held_enabled: bool,
    left_click_interval_ms: i64,
    right_click_interval_ms: i64,
    f7_interval_ms: i64,
    jitter_percent: i64,
    safe_stop_releases_modifiers: bool,
    click_mode: String,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            master_enabled: false,
            left_clicker_enabled: false,
            right_clicker_enabled: false,
            f7_enabled: false,
            shift_held_enabled: false,
            ctrl_held_enabled: false,
            left_click_interval_ms: 80,
            right_click_interval_ms: 120,
            f7_interval_ms: 500,
            jitter_percent: 15,
            safe_stop_releases_modifiers: true,
            click_mode: "send-input".into(),
        }
    }
}

#[derive(Clone)]
struct Hotkey {
    id: String,
    binding: String,
    scope: String,
}

struct Applied {
    shift_down: bool,
    ctrl_down: bool,
    last_left: Instant,
    last_right: Instant,
    last_f7: Instant,
    next_left_off: i64,
    next_right_off: i64,
    next_f7_off: i64,
    last_target_emit: Instant,
    last_activity: Option<Instant>,
    last_block_reason: String,
    last_left_trace: Instant,
    last_right_trace: Instant,
    last_f7_trace: Instant,
    last_focus_attempt: Instant,
}

impl Applied {
    fn new() -> Self {
        let now = Instant::now();
        Applied {
            shift_down: false,
            ctrl_down: false,
            last_left: now,
            last_right: now,
            last_f7: now,
            next_left_off: 0,
            next_right_off: 0,
            next_f7_off: 0,
            last_target_emit: now,
            last_activity: None,
            last_block_reason: String::new(),
            last_left_trace: now,
            last_right_trace: now,
            last_f7_trace: now,
            last_focus_attempt: now,
        }
    }
}

struct Config {
    heartbeat_interval_ms: u64,
    target: Target,
    runtime: Runtime,
    hotkeys: HashMap<String, Hotkey>,
    hotkey_pressed: HashMap<String, bool>,
    applied: Applied,
}

impl Config {
    fn new() -> Self {
        Config {
            heartbeat_interval_ms: 10_000,
            target: Target::default(),
            runtime: Runtime::default(),
            hotkeys: HashMap::new(),
            hotkey_pressed: HashMap::new(),
            applied: Applied::new(),
        }
    }

    fn idle_timeout_ms(&self) -> u64 {
        let hb = self.heartbeat_interval_ms.max(1000);
        (hb * 3).max(5000)
    }

    fn timed_out(&self) -> bool {
        if let Some(last) = self.applied.last_activity {
            last.elapsed().as_millis() as u64 >= self.idle_timeout_ms()
        } else {
            false
        }
    }
}

// ── Jitter ────────────────────────────────────────────────────────────────────

fn jitter_offset(base_ms: i64, pct: i64) -> i64 {
    if pct <= 0 || base_ms <= 0 { return 0; }
    let limit = ((base_ms as f64) * (pct as f64) / 100.0).round() as i64;
    if limit <= 0 { return 0; }
    // Simple deterministic-ish jitter via system time nanos
    let ns = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_nanos() as i64;
    let r = ns % (2 * limit + 1);
    r - limit
}

fn reset_schedule(cfg: &mut Config) {
    let now = Instant::now();
    cfg.applied.last_left = now;
    cfg.applied.last_right = now;
    cfg.applied.last_f7 = now;
    cfg.applied.next_left_off = jitter_offset(cfg.runtime.left_click_interval_ms, cfg.runtime.jitter_percent);
    cfg.applied.next_right_off = jitter_offset(cfg.runtime.right_click_interval_ms, cfg.runtime.jitter_percent);
    cfg.applied.next_f7_off = jitter_offset(cfg.runtime.f7_interval_ms, cfg.runtime.jitter_percent);
}

// ── Hotkey binding → X11 keysym ───────────────────────────────────────────────

fn binding_to_keysym(binding: &str) -> Option<u32> {
    match binding {
        "Escape"       => Some(0xff1b),
        "F1"           => Some(0xffbe),
        "F2"           => Some(0xffbf),
        "F3"           => Some(0xffc0),
        "F7"           => Some(0xffc4),
        "Semicolon"    => Some(0x003b),
        "Quote"        => Some(0x0027),
        "Comma"        => Some(0x002c),
        "BracketLeft"  => Some(0x005b),
        "BracketRight" => Some(0x005d),
        _              => None,
    }
}

// Whether the binding is a mouse button (not keyboard).
fn binding_is_mouse_middle(binding: &str) -> bool {
    binding == "MouseMiddle"
}

// ── Linux / X11 platform ──────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
mod platform {
    use std::collections::HashMap;
    use super::Hotkey;

    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{
        self, AtomEnum, ConnectionExt as XprotoExt, GetPropertyReply, SetInputFocusRequest,
    };
    use x11rb::protocol::xtest::ConnectionExt as XtestExt;
    use x11rb::rust_connection::RustConnection;

    // Publicly exported handle type.
    pub type Hwnd = u32; // X11 Window ID

    pub struct X11Context {
        pub conn:  RustConnection,
        pub root:  Hwnd,
        // Interned atoms cached on connect.
        pub a_net_client_list: u32,
        pub a_net_wm_name: u32,
        pub a_utf8_string: u32,
        pub a_net_active_window: u32,
        pub a_wm_name: u32,
        pub a_string: u32,
        pub a_net_wm_state: u32,
        pub a_net_wm_state_hidden: u32,
        // Keyboard mapping: keysym → keycode
        pub keymap: HashMap<u32, u8>,
    }

    impl X11Context {
        pub fn connect() -> Option<Self> {
            let (conn, screen_num) = match RustConnection::connect(None) {
                Ok(pair) => pair,
                Err(_) => return None,
            };
            let root = conn.setup().roots[screen_num].root;

            let intern = |name: &str| -> u32 {
                conn.intern_atom(false, name.as_bytes())
                    .ok()
                    .and_then(|cookie| cookie.reply().ok())
                    .map(|r| r.atom)
                    .unwrap_or(xproto::AtomEnum::NONE.into())
            };

            let a_net_client_list     = intern("_NET_CLIENT_LIST");
            let a_net_wm_name         = intern("_NET_WM_NAME");
            let a_utf8_string         = intern("UTF8_STRING");
            let a_net_active_window   = intern("_NET_ACTIVE_WINDOW");
            let a_wm_name             = intern("WM_NAME");
            let a_string: u32         = AtomEnum::STRING.into();
            let a_net_wm_state        = intern("_NET_WM_STATE");
            let a_net_wm_state_hidden = intern("_NET_WM_STATE_HIDDEN");

            // Build keysym→keycode map from keyboard mapping.
            let setup    = conn.setup();
            let min_kc   = setup.min_keycode;
            let max_kc   = setup.max_keycode;
            let count    = (max_kc - min_kc + 1) as u8;
            let mut keymap: HashMap<u32, u8> = HashMap::new();
            if let Ok(reply) = conn.get_keyboard_mapping(min_kc, count).and_then(|c| Ok(c.reply()?)) {
                let ks_per_kc = reply.keysyms_per_keycode as usize;
                for (i, chunk) in reply.keysyms.chunks(ks_per_kc).enumerate() {
                    for &ks in chunk {
                        if ks != 0 && !keymap.contains_key(&ks) {
                            keymap.insert(ks, min_kc + i as u8);
                        }
                    }
                }
            }

            Some(Self {
                conn,
                root,
                a_net_client_list,
                a_net_wm_name,
                a_utf8_string,
                a_net_active_window,
                a_wm_name,
                a_string,
                a_net_wm_state,
                a_net_wm_state_hidden,
                keymap,
            })
        }

        fn get_property_bytes(&self, window: Hwnd, atom: u32, type_atom: u32) -> Option<Vec<u8>> {
            let reply = self.conn
                .get_property(false, window, atom, type_atom, 0, u32::MAX)
                .ok()?.reply().ok()?;
            if reply.value.is_empty() { None } else { Some(reply.value) }
        }

        fn get_window_title(&self, window: Hwnd) -> String {
            if let Some(bytes) = self.get_property_bytes(window, self.a_net_wm_name, self.a_utf8_string) {
                return String::from_utf8_lossy(&bytes).into_owned();
            }
            if let Some(bytes) = self.get_property_bytes(window, self.a_wm_name, self.a_string) {
                return String::from_utf8_lossy(&bytes).into_owned();
            }
            String::new()
        }

        fn get_client_list(&self) -> Vec<Hwnd> {
            let bytes = match self.get_property_bytes(self.root, self.a_net_client_list, AtomEnum::WINDOW.into()) {
                Some(b) => b,
                None => return vec![],
            };
            bytes.chunks_exact(4)
                .map(|c| u32::from_ne_bytes([c[0], c[1], c[2], c[3]]))
                .collect()
        }

        pub fn find_window_by_title(&self, pattern: &str) -> Option<Hwnd> {
            if pattern.is_empty() { return None; }
            let pat = pattern.to_ascii_lowercase();
            for wid in self.get_client_list() {
                let title = self.get_window_title(wid).to_ascii_lowercase();
                if title.contains(&pat) {
                    return Some(wid);
                }
            }
            None
        }

        fn active_window(&self) -> Option<Hwnd> {
            let bytes = self.get_property_bytes(self.root, self.a_net_active_window, AtomEnum::WINDOW.into())?;
            if bytes.len() < 4 { return None; }
            let wid = u32::from_ne_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
            if wid == 0 { None } else { Some(wid) }
        }

        pub fn is_foreground(&self, window: Hwnd) -> bool {
            self.active_window().map_or(false, |w| w == window)
        }

        pub fn get_rect(&self, window: Hwnd) -> Option<(i32, i32, u32, u32)> {
            let geom = self.conn.get_geometry(window).ok()?.reply().ok()?;
            // Translate to root coordinates.
            let translated = self.conn.translate_coordinates(window, self.root, 0, 0).ok()?.reply().ok()?;
            Some((translated.dst_x as i32, translated.dst_y as i32, geom.width as u32, geom.height as u32))
        }

        pub fn activate_window(&self, window: Hwnd) -> bool {
            // Raise and set input focus.
            let _ = self.conn.configure_window(window, &xproto::ConfigureWindowAux::new().stack_mode(xproto::StackMode::ABOVE));
            let _ = self.conn.set_input_focus(xproto::InputFocus::POINTER_ROOT, window, xproto::Time::CURRENT_TIME);
            // Request _NET_ACTIVE_WINDOW via ClientMessage.
            let data = [2u32, xproto::Time::CURRENT_TIME.into(), 0, 0, 0];
            let event = xproto::ClientMessageEvent {
                response_type: xproto::CLIENT_MESSAGE_EVENT,
                format: 32,
                sequence: 0,
                window,
                type_: self.a_net_active_window,
                data: xproto::ClientMessageData::from(data),
            };
            let _ = self.conn.send_event(
                false,
                self.root,
                xproto::EventMask::SUBSTRUCTURE_REDIRECT | xproto::EventMask::SUBSTRUCTURE_NOTIFY,
                event.serialize(),
            );
            let _ = self.conn.flush();
            std::thread::sleep(std::time::Duration::from_millis(60));
            self.is_foreground(window)
        }

        pub fn left_click(&self) {
            use x11rb::protocol::xtest::ConnectionExt;
            let _ = self.conn.xtest_fake_input(xproto::BUTTON_PRESS_EVENT, 1, 0, self.root, 0, 0, 0);
            std::thread::sleep(std::time::Duration::from_millis(8));
            let _ = self.conn.xtest_fake_input(xproto::BUTTON_RELEASE_EVENT, 1, 0, self.root, 0, 0, 0);
            let _ = self.conn.flush();
        }

        pub fn right_click(&self) {
            use x11rb::protocol::xtest::ConnectionExt;
            let _ = self.conn.xtest_fake_input(xproto::BUTTON_PRESS_EVENT, 3, 0, self.root, 0, 0, 0);
            std::thread::sleep(std::time::Duration::from_millis(8));
            let _ = self.conn.xtest_fake_input(xproto::BUTTON_RELEASE_EVENT, 3, 0, self.root, 0, 0, 0);
            let _ = self.conn.flush();
        }

        pub fn key_down_sym(&self, keysym: u32) {
            use x11rb::protocol::xtest::ConnectionExt;
            if let Some(&kc) = self.keymap.get(&keysym) {
                let _ = self.conn.xtest_fake_input(xproto::KEY_PRESS_EVENT, kc, 0, self.root, 0, 0, 0);
                let _ = self.conn.flush();
            }
        }

        pub fn key_up_sym(&self, keysym: u32) {
            use x11rb::protocol::xtest::ConnectionExt;
            if let Some(&kc) = self.keymap.get(&keysym) {
                let _ = self.conn.xtest_fake_input(xproto::KEY_RELEASE_EVENT, kc, 0, self.root, 0, 0, 0);
                let _ = self.conn.flush();
            }
        }

        pub fn key_tap_sym(&self, keysym: u32) {
            self.key_down_sym(keysym);
            std::thread::sleep(std::time::Duration::from_millis(8));
            self.key_up_sym(keysym);
        }

        /// Shift: XK_Shift_L 0xFFE1
        pub fn shift_down(&self)  { self.key_down_sym(0xffe1); }
        pub fn shift_up(&self)    { self.key_up_sym(0xffe1); }
        /// Ctrl: XK_Control_L 0xFFE3
        pub fn ctrl_down(&self)   { self.key_down_sym(0xffe3); }
        pub fn ctrl_up(&self)     { self.key_up_sym(0xffe3); }
        /// Alt: XK_Alt_L 0xFFE9
        pub fn alt_down(&self)    { self.key_down_sym(0xffe9); }
        pub fn alt_up(&self)      { self.key_up_sym(0xffe9); }
        /// F7: XK_F7 0xFFC4
        pub fn f7_tap(&self)      { self.key_tap_sym(0xffc4); }

        pub fn release_modifiers(&self) {
            for &ks in &[0xffe1u32, 0xffe2, 0xffe3, 0xffe4, 0xffe9, 0xffea] {
                self.key_up_sym(ks);
            }
        }

        /// Returns a 32-byte keymap array (bit per keycode).
        pub fn query_keymap(&self) -> [u8; 32] {
            self.conn.query_keymap().ok()
                .and_then(|c| c.reply().ok())
                .map(|r| {
                    let mut out = [0u8; 32];
                    let src = r.keys;
                    let len = src.len().min(32);
                    out[..len].copy_from_slice(&src[..len]);
                    out
                })
                .unwrap_or([0u8; 32])
        }

        pub fn is_key_down_sym(&self, keysym: u32) -> bool {
            if let Some(&kc) = self.keymap.get(&keysym) {
                let map = self.query_keymap();
                let byte = (kc / 8) as usize;
                let bit  = kc % 8;
                if byte < 32 { return (map[byte] >> bit) & 1 != 0; }
            }
            false
        }

        /// Poll for hotkeys. Returns list of triggered hotkey IDs.
        pub fn poll_hotkeys(
            &self,
            hotkeys: &std::collections::HashMap<String, Hotkey>,
            pressed: &mut std::collections::HashMap<String, bool>,
            target_is_foreground: bool,
        ) -> Vec<String> {
            let mut triggered = vec![];
            for (id, hk) in hotkeys {
                if hk.scope == "game-focused" && !target_is_foreground {
                    pressed.insert(id.clone(), false);
                    continue;
                }

                let is_down = if super::binding_is_mouse_middle(&hk.binding) {
                    // Poll middle mouse button (button 2 in X11).
                    use x11rb::protocol::xproto::ConnectionExt as CE;
                    self.conn.query_pointer(self.root).ok()
                        .and_then(|c| c.reply().ok())
                        .map(|r| (r.mask & xproto::KeyButMask::BUTTON2.into()) != 0)
                        .unwrap_or(false)
                } else if let Some(ks) = super::binding_to_keysym(&hk.binding) {
                    self.is_key_down_sym(ks)
                } else {
                    false
                };

                let was = *pressed.get(id).unwrap_or(&false);
                if is_down && !was {
                    pressed.insert(id.clone(), true);
                    triggered.push(id.clone());
                } else if !is_down && was {
                    pressed.insert(id.clone(), false);
                }
            }
            triggered
        }

        pub fn get_cursor_pos(&self) -> (i32, i32) {
            use x11rb::protocol::xproto::ConnectionExt as CE;
            self.conn.query_pointer(self.root).ok()
                .and_then(|c| c.reply().ok())
                .map(|r| (r.root_x as i32, r.root_y as i32))
                .unwrap_or((0, 0))
        }
    }
}

// ── Target-status helpers ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn get_target_status(ctx: &platform::X11Context, target: &Target) -> Value {
    let window = find_target_window(ctx, target);
    let attached = window.is_some();
    let (title, is_fg, rect) = if let Some(wid) = window {
        let t = {
            use x11rb::protocol::xproto::ConnectionExt as CE;
            // Re-fetch via our helper.
            ctx.get_window_title_pub(wid)
        };
        let fg = ctx.is_foreground(wid);
        let r = ctx.get_rect(wid).map(|(x, y, w, h)| json!({"x":x,"y":y,"width":w,"height":h}));
        (t, fg, r)
    } else {
        (String::new(), false, None)
    };

    json!({
        "attached":              attached,
        "isForeground":          is_fg,
        "title":                 title,
        "windowTitlePattern":    target.window_title_pattern,
        "matchedPattern":        if attached { &target.window_title_pattern } else { "" },
        "rect":                  rect,
    })
}

#[cfg(target_os = "linux")]
fn find_target_window(ctx: &platform::X11Context, target: &Target) -> Option<platform::Hwnd> {
    let raw = &target.window_title_pattern;
    // Try the pattern directly, then without brackets, then fallback.
    let trimmed = raw.trim().trim_matches(|c| c == '[' || c == ']');
    for pat in &[raw.as_str(), trimmed, "ClassicConquer"] {
        if pat.len() < 3 { continue; }
        if let Some(wid) = ctx.find_window_by_title(pat) {
            return Some(wid);
        }
    }
    None
}

#[cfg(target_os = "linux")]
impl platform::X11Context {
    // Public re-export of the title getter.
    pub fn get_window_title_pub(&self, wid: platform::Hwnd) -> String {
        self.get_window_title(wid)
    }
}

// ── Non-Linux stub ────────────────────────────────────────────────────────────

#[cfg(not(target_os = "linux"))]
fn get_target_status_stub(pattern: &str) -> Value {
    json!({
        "attached": false,
        "isForeground": false,
        "title": "",
        "windowTitlePattern": pattern,
        "matchedPattern": "",
        "rect": null,
    })
}

// ── Runtime tick ──────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn runtime_tick(cfg: &mut Config, ctx: &platform::X11Context, out: &Out) {
    let now = Instant::now();
    let status = get_target_status(ctx, &cfg.target);

    // Emit target-status at ~750ms intervals.
    if now.duration_since(cfg.applied.last_target_emit) >= Duration::from_millis(750) {
        cfg.applied.last_target_emit = now;
        send_target_status(out, &status);
    }

    // Poll hotkeys.
    let fg = status["isForeground"].as_bool().unwrap_or(false);
    let triggered = ctx.poll_hotkeys(&cfg.hotkeys, &mut cfg.hotkey_pressed, fg);
    for id in triggered {
        if let Some(hk) = cfg.hotkeys.get(&id) {
            send(out, json!({
                "type": "hotkey-triggered",
                "payload": {
                    "hotkeyId": id,
                    "binding":  hk.binding,
                    "triggeredAt": iso_now(),
                }
            }));
        }
    }

    let rt = cfg.runtime.clone();

    // Master disabled.
    if !rt.master_enabled {
        let had_input = rt.left_clicker_enabled || rt.right_clicker_enabled || rt.f7_enabled || rt.shift_held_enabled || rt.ctrl_held_enabled;
        if had_input {
            set_block_reason(cfg, ctx, "master-disabled", &status, out);
        } else {
            set_block_reason(cfg, ctx, "", &status, out);
        }
        // Release modifiers if needed.
        if rt.safe_stop_releases_modifiers && (cfg.applied.shift_down || cfg.applied.ctrl_down) {
            ctx.release_modifiers();
            cfg.applied.shift_down = false;
            cfg.applied.ctrl_down = false;
        }
        return;
    }

    // Target not found.
    if !status["attached"].as_bool().unwrap_or(false) {
        set_block_reason(cfg, ctx, "target-not-found", &status, out);
        if rt.safe_stop_releases_modifiers {
            ctx.release_modifiers();
            cfg.applied.shift_down = false;
            cfg.applied.ctrl_down = false;
        }
        return;
    }

    // Target must be foreground.
    if cfg.target.require_foreground_for_input && !fg {
        let has_input = rt.left_clicker_enabled || rt.right_clicker_enabled || rt.f7_enabled || rt.shift_held_enabled || rt.ctrl_held_enabled;
        if has_input && now.duration_since(cfg.applied.last_focus_attempt) >= Duration::from_millis(350) {
            cfg.applied.last_focus_attempt = now;
            if let Some(wid) = find_target_window(ctx, &cfg.target) {
                ctx.activate_window(wid);
            }
        }
        if !fg {
            set_block_reason(cfg, ctx, "target-background", &status, out);
            if rt.safe_stop_releases_modifiers {
                ctx.release_modifiers();
                cfg.applied.shift_down = false;
                cfg.applied.ctrl_down = false;
            }
            return;
        }
    }

    set_block_reason(cfg, ctx, "", &status, out);

    // Apply modifier state.
    if rt.shift_held_enabled && !cfg.applied.shift_down {
        ctx.shift_down();
        cfg.applied.shift_down = true;
    } else if !rt.shift_held_enabled && cfg.applied.shift_down {
        ctx.shift_up();
        cfg.applied.shift_down = false;
    }
    if rt.ctrl_held_enabled && !cfg.applied.ctrl_down {
        ctx.ctrl_down();
        cfg.applied.ctrl_down = true;
    } else if !rt.ctrl_held_enabled && cfg.applied.ctrl_down {
        ctx.ctrl_up();
        cfg.applied.ctrl_down = false;
    }

    // Left clicker.
    if rt.left_clicker_enabled {
        let interval = (rt.left_click_interval_ms + cfg.applied.next_left_off).max(1) as u64;
        if now.duration_since(cfg.applied.last_left) >= Duration::from_millis(interval) {
            ctx.left_click();
            cfg.applied.last_left = now;
            cfg.applied.next_left_off = jitter_offset(rt.left_click_interval_ms, rt.jitter_percent);
            if now.duration_since(cfg.applied.last_left_trace) >= Duration::from_secs(1) {
                cfg.applied.last_left_trace = now;
                send_log(out, "Runtime left click via XTEST.", None);
            }
        }
    }

    // Right clicker.
    if rt.right_clicker_enabled {
        let interval = (rt.right_click_interval_ms + cfg.applied.next_right_off).max(1) as u64;
        if now.duration_since(cfg.applied.last_right) >= Duration::from_millis(interval) {
            ctx.right_click();
            cfg.applied.last_right = now;
            cfg.applied.next_right_off = jitter_offset(rt.right_click_interval_ms, rt.jitter_percent);
            if now.duration_since(cfg.applied.last_right_trace) >= Duration::from_secs(1) {
                cfg.applied.last_right_trace = now;
                send_log(out, "Runtime right click via XTEST.", None);
            }
        }
    }

    // F7.
    if rt.f7_enabled {
        let interval = (rt.f7_interval_ms + cfg.applied.next_f7_off).max(1) as u64;
        if now.duration_since(cfg.applied.last_f7) >= Duration::from_millis(interval) {
            ctx.f7_tap();
            cfg.applied.last_f7 = now;
            cfg.applied.next_f7_off = jitter_offset(rt.f7_interval_ms, rt.jitter_percent);
            if now.duration_since(cfg.applied.last_f7_trace) >= Duration::from_secs(1) {
                cfg.applied.last_f7_trace = now;
                send_log(out, "Runtime F7 press via XTEST.", None);
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn set_block_reason(cfg: &mut Config, ctx: &platform::X11Context, reason: &str, status: &Value, out: &Out) {
    if cfg.applied.last_block_reason == reason { return; }
    if reason.is_empty() {
        if !cfg.applied.last_block_reason.is_empty() {
            send_log(out, "Runtime resumed.", Some(json!({"target": status})));
        }
    } else {
        send_log(out, &format!("Runtime paused: {reason}."), Some(json!({"reason": reason, "target": status})));
    }
    cfg.applied.last_block_reason = reason.to_owned();
}

// ── Perform test action ───────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn perform_test_action(action: &str, cfg: &Config, ctx: &platform::X11Context, out: &Out) -> Result<Value, String> {
    if action == "releaseModifiers" {
        ctx.release_modifiers();
        return Ok(json!({"ok":true,"action":"releaseModifiers","focusAttempted":false,"focusResult":null,"details":{"action":"releaseModifiers","reason":"test"}}));
    }

    // For all other actions, we need the target window.
    let status = get_target_status(ctx, &cfg.target);
    if !status["attached"].as_bool().unwrap_or(false) {
        return Err("No matching target window was found.".into());
    }

    let mut focus_attempted = false;
    let mut focus_result_val = Value::Null;
    if cfg.target.require_foreground_for_input && !status["isForeground"].as_bool().unwrap_or(false) {
        focus_attempted = true;
        let wid = find_target_window(ctx, &cfg.target).ok_or("No target window")?;
        let activated = ctx.activate_window(wid);
        let new_status = get_target_status(ctx, &cfg.target);
        send_target_status(out, &new_status);
        focus_result_val = json!({"ok": new_status["attached"], "activated": activated, "target": new_status});
        if cfg.target.require_foreground_for_input && !new_status["isForeground"].as_bool().unwrap_or(false) {
            return Err("Target window is not in the foreground after focus attempt.".into());
        }
    }

    let details = match action {
        "leftClick" => {
            ctx.left_click();
            send_log(out, "Test left click via XTEST.", None);
            json!({"action":"leftClick","reason":"test"})
        }
        "rightClick" => {
            ctx.right_click();
            send_log(out, "Test right click via XTEST.", None);
            json!({"action":"rightClick","reason":"test"})
        }
        "f7Press" => {
            ctx.f7_tap();
            send_log(out, "Test F7 press via XTEST.", None);
            json!({"action":"f7Press","reason":"test"})
        }
        "shiftDown"  => { ctx.shift_down();  json!({"action":"shiftDown","reason":"test"}) }
        "shiftUp"    => { ctx.shift_up();    json!({"action":"shiftUp","reason":"test"}) }
        "ctrlDown"   => { ctx.ctrl_down();   json!({"action":"ctrlDown","reason":"test"}) }
        "ctrlUp"     => { ctx.ctrl_up();     json!({"action":"ctrlUp","reason":"test"}) }
        _ => return Err(format!("Unknown test action: {action}")),
    };

    let status = get_target_status(ctx, &cfg.target);
    Ok(json!({
        "ok": true,
        "action": action,
        "target": status,
        "focusAttempted": focus_attempted,
        "focusResult": focus_result_val,
        "details": details,
    }))
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    let out: Out = Arc::new(Mutex::new(BufWriter::new(io::stdout())));

    // Spawn background stdin reader thread.
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    {
        let tx = tx.clone();
        thread::spawn(move || {
            let stdin = io::stdin();
            for line in stdin.lock().lines() {
                match line {
                    Ok(l) => { if tx.send(l).is_err() { break; } }
                    Err(_) => break,
                }
            }
        });
    }

    // Connect to X11 (Linux only).
    #[cfg(target_os = "linux")]
    let ctx_opt = platform::X11Context::connect();
    #[cfg(target_os = "linux")]
    if ctx_opt.is_none() {
        let _ = send_error(&out, None, "AUTOMATION_HELPER_INIT_FAILED", "Could not connect to X11 display. Is DISPLAY set?");
    }

    let mut cfg = Config::new();

    // Release any stale modifiers.
    #[cfg(target_os = "linux")]
    if let Some(ref ctx) = ctx_opt {
        ctx.release_modifiers();
    }

    // Send hello.
    send(&out, json!({
        "type": "hello",
        "payload": {
            "protocolVersion": 1,
            "capabilities": [
                "targetLookup",
                "targetTitleFallback",
                "foregroundCheck",
                "focusTarget",
                "leftClick",
                "rightClick",
                "f7Press",
                "shiftHold",
                "ctrlHold",
                "hotkeyRegistration",
            ]
        }
    }));

    cfg.applied.last_activity = Some(Instant::now());

    // Main loop.
    loop {
        // Process pending stdin messages (non-blocking drain).
        let mut shutdown = false;
        loop {
            match rx.try_recv() {
                Ok(line) => {
                    let line = line.trim().to_owned();
                    if line.is_empty() { continue; }
                    cfg.applied.last_activity = Some(Instant::now());

                    let msg: Value = match serde_json::from_str(&line) {
                        Ok(v) => v,
                        Err(e) => {
                            send_error(&out, None, "AUTOMATION_HELPER_BAD_JSON", &e.to_string());
                            continue;
                        }
                    };

                    let msg_type = msg["type"].as_str().unwrap_or("").to_owned();
                    let req_id   = msg["requestId"].as_str().map(|s| s.to_owned());
                    let payload  = &msg["payload"];
                    let rid      = req_id.as_deref();

                    match msg_type.as_str() {
                        "heartbeat" => {
                            send(&out, json!({"type":"heartbeat","payload":{"receivedAt": iso_now()}}));
                            send_result(&out, rid, json!({"ok": true}));
                        }

                        "configure-session" => {
                            if let Some(ms) = payload["heartbeatIntervalMs"].as_u64() {
                                cfg.heartbeat_interval_ms = ms;
                            }
                            send_result(&out, rid, json!({"ok": true, "protocolVersion": 1}));
                        }

                        "set-target" => {
                            cfg.target.window_title_pattern = payload["windowTitlePattern"]
                                .as_str().unwrap_or("ClassicConquer").to_owned();
                            cfg.target.require_foreground_for_input = payload["requireForegroundForInput"]
                                .as_bool().unwrap_or(true);
                            #[cfg(target_os = "linux")]
                            let status = ctx_opt.as_ref().map(|ctx| get_target_status(ctx, &cfg.target))
                                .unwrap_or_else(|| json!({"attached":false,"isForeground":false,"title":"","windowTitlePattern":cfg.target.window_title_pattern,"matchedPattern":"","rect":null}));
                            #[cfg(not(target_os = "linux"))]
                            let status = get_target_status_stub(&cfg.target.window_title_pattern);
                            send_target_status(&out, &status);
                            send_result(&out, rid, status);
                        }

                        "focus-target" => {
                            #[cfg(target_os = "linux")]
                            let result = if let Some(ref ctx) = ctx_opt {
                                let wid = find_target_window(ctx, &cfg.target);
                                if let Some(wid) = wid {
                                    let activated = ctx.activate_window(wid);
                                    let status = get_target_status(ctx, &cfg.target);
                                    send_target_status(&out, &status);
                                    json!({"ok": status["attached"], "activated": activated, "target": status})
                                } else {
                                    let status = get_target_status(ctx, &cfg.target);
                                    json!({"ok": false, "activated": false, "target": status})
                                }
                            } else {
                                json!({"ok": false, "activated": false, "target": get_target_status_stub_owned(&cfg.target.window_title_pattern)})
                            };
                            #[cfg(not(target_os = "linux"))]
                            let result = json!({"ok":false,"activated":false,"target":get_target_status_stub(&cfg.target.window_title_pattern)});
                            send(&out, json!({"type":"target-status","payload":result["target"]}));
                            send_result(&out, rid, result);
                        }

                        "set-runtime-config" => {
                            if let Some(rt) = payload["runtime"].as_object() {
                                if let Some(v) = rt.get("leftClickIntervalMs").and_then(|v| v.as_i64()) { cfg.runtime.left_click_interval_ms = v; }
                                if let Some(v) = rt.get("rightClickIntervalMs").and_then(|v| v.as_i64()) { cfg.runtime.right_click_interval_ms = v; }
                                if let Some(v) = rt.get("f7IntervalMs").and_then(|v| v.as_i64()) { cfg.runtime.f7_interval_ms = v; }
                                if let Some(v) = rt.get("jitterPercent").and_then(|v| v.as_i64()) { cfg.runtime.jitter_percent = v; }
                                if let Some(v) = rt.get("safeStopReleasesModifiers").and_then(|v| v.as_bool()) { cfg.runtime.safe_stop_releases_modifiers = v; }
                                if let Some(v) = rt.get("clickMode").and_then(|v| v.as_str()) { cfg.runtime.click_mode = v.to_owned(); }
                            }
                            reset_schedule(&mut cfg);
                            send_result(&out, rid, json!({"ok": true}));
                        }

                        "register-hotkeys" => {
                            cfg.hotkeys.clear();
                            cfg.hotkey_pressed.clear();
                            let mut registered = 0usize;
                            if let Some(hks) = payload["hotkeys"].as_object() {
                                for (id, entry) in hks {
                                    if !entry["enabled"].as_bool().unwrap_or(false) { continue; }
                                    let binding = match entry["binding"].as_str() {
                                        Some(b) if !b.is_empty() => b.to_owned(),
                                        _ => continue,
                                    };
                                    let valid = binding_to_keysym(&binding).is_some() || binding_is_mouse_middle(&binding);
                                    if !valid { continue; }
                                    let scope = entry["scope"].as_str().unwrap_or("global").to_owned();
                                    cfg.hotkeys.insert(id.clone(), Hotkey { id: id.clone(), binding, scope });
                                    cfg.hotkey_pressed.insert(id.clone(), false);
                                    registered += 1;
                                }
                            }
                            send_result(&out, rid, json!({"ok": true, "registered": registered}));
                        }

                        "set-toggle-state" => {
                            if let Some(rt) = payload["runtime"].as_object() {
                                macro_rules! apply_bool {
                                    ($field:ident, $key:expr) => {
                                        if let Some(v) = rt.get($key).and_then(|v| v.as_bool()) {
                                            cfg.runtime.$field = v;
                                        }
                                    };
                                }
                                apply_bool!(master_enabled,        "masterEnabled");
                                apply_bool!(left_clicker_enabled,  "leftClickerEnabled");
                                apply_bool!(right_clicker_enabled, "rightClickerEnabled");
                                apply_bool!(f7_enabled,            "f7Enabled");
                                apply_bool!(shift_held_enabled,    "shiftHeldEnabled");
                                apply_bool!(ctrl_held_enabled,     "ctrlHeldEnabled");
                            }
                            if !cfg.runtime.master_enabled && cfg.runtime.safe_stop_releases_modifiers {
                                #[cfg(target_os = "linux")]
                                if let Some(ref ctx) = ctx_opt {
                                    ctx.release_modifiers();
                                }
                                cfg.applied.shift_down = false;
                                cfg.applied.ctrl_down = false;
                            }
                            reset_schedule(&mut cfg);

                            #[cfg(target_os = "linux")]
                            let status = ctx_opt.as_ref().map(|ctx| get_target_status(ctx, &cfg.target))
                                .unwrap_or_else(|| json!({"attached":false}));
                            #[cfg(not(target_os = "linux"))]
                            let status = get_target_status_stub(&cfg.target.window_title_pattern);

                            let rt = &cfg.runtime;
                            let snapshot = json!({
                                "runtime": {
                                    "masterEnabled":        rt.master_enabled,
                                    "leftClickerEnabled":   rt.left_clicker_enabled,
                                    "rightClickerEnabled":  rt.right_clicker_enabled,
                                    "f7Enabled":            rt.f7_enabled,
                                    "shiftHeldEnabled":     rt.shift_held_enabled,
                                    "ctrlHeldEnabled":      rt.ctrl_held_enabled,
                                },
                                "target":    status,
                                "appliedAt": iso_now(),
                            });
                            send_log(&out, "Runtime toggles applied.", Some(json!({"runtime": snapshot["runtime"], "target": snapshot["target"]})));
                            send(&out, json!({"type":"runtime-applied","payload": snapshot}));
                            send_result(&out, rid, snapshot);
                        }

                        "perform-test-action" => {
                            let action = payload["action"].as_str().unwrap_or("").to_owned();
                            #[cfg(target_os = "linux")]
                            let result_val = if let Some(ref ctx) = ctx_opt {
                                perform_test_action(&action, &cfg, ctx, &out)
                            } else {
                                Err("X11 not available".into())
                            };
                            #[cfg(not(target_os = "linux"))]
                            let result_val: Result<Value, String> = Err("Automation not supported on this platform".into());
                            match result_val {
                                Ok(v)  => send_result(&out, rid, v),
                                Err(e) => send_error(&out, rid, "AUTOMATION_HELPER_EXCEPTION", &e),
                            }
                        }

                        "perform-emergency-release" | "emergency-stop" => {
                            #[cfg(target_os = "linux")]
                            if let Some(ref ctx) = ctx_opt { ctx.release_modifiers(); }
                            cfg.applied.shift_down = false;
                            cfg.applied.ctrl_down = false;
                            send_result(&out, rid, json!({"ok": true}));
                        }

                        "shutdown" => {
                            #[cfg(target_os = "linux")]
                            if let Some(ref ctx) = ctx_opt { ctx.release_modifiers(); }
                            send_result(&out, rid, json!({"ok": true}));
                            shutdown = true;
                            break;
                        }

                        other => {
                            send_error(&out, rid, "AUTOMATION_UNKNOWN_MESSAGE",
                                &format!("Unknown helper message type: {other}"));
                        }
                    }
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    // stdin closed.
                    shutdown = true;
                    break;
                }
            }
        }

        if shutdown { break; }

        // Idle timeout.
        if cfg.timed_out() {
            send_log(&out, "Helper idle timeout reached; shutting down orphaned helper.", None);
            break;
        }

        // Runtime tick.
        #[cfg(target_os = "linux")]
        if let Some(ref ctx) = ctx_opt {
            runtime_tick(&mut cfg, ctx, &out);
        }

        thread::sleep(Duration::from_millis(10));
    }

    // Final cleanup.
    #[cfg(target_os = "linux")]
    if let Some(ref ctx) = ctx_opt {
        ctx.release_modifiers();
    }
}

// Stub for focus-target on non-Linux (avoids duplicate code in macro body).
#[cfg(not(target_os = "linux"))]
fn get_target_status_stub_owned(pattern: &str) -> Value {
    get_target_status_stub(pattern)
}
#[cfg(target_os = "linux")]
fn get_target_status_stub_owned(_: &str) -> Value { Value::Null }
