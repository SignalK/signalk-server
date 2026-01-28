//! NMEA Converter WASM Plugin for Signal K
//!
//! Demonstrates the generic event mechanism by converting NMEA 0183 sentences
//! to NMEA 2000 PGN JSON format. This showcases how WASM plugins can:
//! - Subscribe to generic events (nmea0183, nmea0183out)
//! - Emit generic events (nmea2000JsonOut) for interop with other plugins
//!
//! Supported conversions:
//! - RMC (Recommended Minimum) -> PGN 129025 (Position), PGN 129026 (COG/SOG)
//! - GGA (Fix Data) -> PGN 129025 (Position)

use std::cell::RefCell;
use serde::{Deserialize, Serialize};

#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_debug(ptr: *const u8, len: usize);
    fn sk_set_status(ptr: *const u8, len: usize);
    fn sk_set_error(ptr: *const u8, len: usize);
    fn sk_subscribe_events(event_types_ptr: *const u8, event_types_len: usize) -> i32;
    fn sk_emit_event(
        type_ptr: *const u8,
        type_len: usize,
        data_ptr: *const u8,
        data_len: usize,
    ) -> i32;
    fn sk_get_allowed_event_types(buf_ptr: *mut u8, buf_max_len: usize) -> i32;
}

fn debug(msg: &str) {
    unsafe { sk_debug(msg.as_ptr(), msg.len()); }
}

fn set_status(msg: &str) {
    unsafe { sk_set_status(msg.as_ptr(), msg.len()); }
}

fn set_error(msg: &str) {
    unsafe { sk_set_error(msg.as_ptr(), msg.len()); }
}

fn subscribe_events(event_types: &[&str]) -> bool {
    let json = serde_json::to_string(event_types).unwrap_or_else(|_| "[]".to_string());
    unsafe { sk_subscribe_events(json.as_ptr(), json.len()) == 1 }
}

/// Emit an event to the server. For generic events like nmea2000JsonOut,
/// the data is emitted directly without wrapping.
fn emit_event(event_type: &str, data: &impl Serialize) -> bool {
    let data_json = serde_json::to_string(data).unwrap_or_else(|_| "{}".to_string());
    unsafe {
        sk_emit_event(
            event_type.as_ptr(),
            event_type.len(),
            data_json.as_ptr(),
            data_json.len(),
        ) == 1
    }
}

#[allow(dead_code)]
fn get_allowed_event_types() -> Vec<String> {
    let mut buf = vec![0u8; 1024];
    let len = unsafe { sk_get_allowed_event_types(buf.as_mut_ptr(), buf.len()) };
    if len > 0 {
        buf.truncate(len as usize);
        let json = String::from_utf8_lossy(&buf);
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        Vec::new()
    }
}

thread_local! {
    static STATE: RefCell<PluginState> = RefCell::new(PluginState::default());
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginConfig {
    /// Enable debug logging of all received events
    #[serde(default)]
    enable_debug: bool,

    /// Source ID for emitted PGNs (default: "wasm-nmea-converter")
    #[serde(default = "default_source_id")]
    source_id: String,
}

fn default_source_id() -> String { "wasm-nmea-converter".to_string() }

#[derive(Debug, Default)]
struct PluginState {
    config: PluginConfig,
    is_running: bool,

    // Statistics tracking
    nmea0183_received: u64,
    pgns_emitted: u64,
    parse_errors: u64,
}

#[no_mangle]
pub extern "C" fn allocate(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn deallocate(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

static PLUGIN_ID: &str = "nmea-converter-rust";
static PLUGIN_NAME: &str = "NMEA Converter (Rust)";
static PLUGIN_SCHEMA: &str = r#"{
    "type": "object",
    "title": "NMEA Converter Configuration",
    "properties": {
        "enableDebug": {
            "type": "boolean",
            "title": "Enable Debug Logging",
            "description": "Log all received NMEA sentences and emitted PGNs",
            "default": false
        },
        "sourceId": {
            "type": "string",
            "title": "Source ID",
            "description": "Source identifier for emitted PGNs",
            "default": "wasm-nmea-converter"
        }
    }
}"#;

#[no_mangle]
pub extern "C" fn plugin_id(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_ID, out_ptr, out_max_len)
}

#[no_mangle]
pub extern "C" fn plugin_name(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_NAME, out_ptr, out_max_len)
}

#[no_mangle]
pub extern "C" fn plugin_schema(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_SCHEMA, out_ptr, out_max_len)
}

#[no_mangle]
pub extern "C" fn plugin_start(config_ptr: *const u8, config_len: usize) -> i32 {
    let config_json = unsafe {
        let slice = std::slice::from_raw_parts(config_ptr, config_len);
        String::from_utf8_lossy(slice).to_string()
    };

    let parsed_config: PluginConfig = match serde_json::from_str(&config_json) {
        Ok(c) => c,
        Err(e) => {
            set_error(&format!("Failed to parse config: {}", e));
            return 1;
        }
    };

    STATE.with(|state| {
        let mut s = state.borrow_mut();
        s.config = parsed_config.clone();
        s.is_running = true;
        s.nmea0183_received = 0;
        s.pgns_emitted = 0;
        s.parse_errors = 0;
    });

    debug(&format!(
        "NMEA Converter starting with source: {}",
        parsed_config.source_id
    ));

    // Subscribe to NMEA 0183 events (both raw and derived)
    if subscribe_events(&["nmea0183", "nmea0183out"]) {
        debug("Subscribed to nmea0183 and nmea0183out events");
    } else {
        set_error("Failed to subscribe to NMEA events");
        return 1;
    }

    set_status("Converting NMEA 0183 to NMEA 2000");
    0
}

#[no_mangle]
pub extern "C" fn plugin_stop() -> i32 {
    STATE.with(|state| {
        let mut s = state.borrow_mut();
        s.is_running = false;

        debug(&format!(
            "NMEA Converter stopping. Received: {}, Emitted: {}, Errors: {}",
            s.nmea0183_received, s.pgns_emitted, s.parse_errors
        ));
    });

    set_status("Stopped");
    0
}

#[no_mangle]
pub extern "C" fn event_handler(event_ptr: *const u8, event_len: usize) {
    let event_json = unsafe {
        let slice = std::slice::from_raw_parts(event_ptr, event_len);
        String::from_utf8_lossy(slice).to_string()
    };

    let event: ServerEvent = match serde_json::from_str(&event_json) {
        Ok(e) => e,
        Err(e) => {
            debug(&format!("Failed to parse event: {}", e));
            return;
        }
    };

    STATE.with(|state| {
        let mut s = state.borrow_mut();

        match event.event_type.as_str() {
            "nmea0183" | "nmea0183out" => {
                s.nmea0183_received += 1;
                handle_nmea0183(&mut s, &event);
            }
            _ => {
                if s.config.enable_debug {
                    debug(&format!("Ignoring event type: {}", event.event_type));
                }
            }
        }
    });
}

/// Server event structure
#[derive(Debug, Deserialize)]
struct ServerEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[allow(dead_code)]
    from: Option<String>,
    data: serde_json::Value,
    #[allow(dead_code)]
    timestamp: u64,
}

/// PGN 129025 - Position, Rapid Update
#[derive(Debug, Serialize)]
struct Pgn129025 {
    pgn: u32,
    src: String,
    dst: u8,
    prio: u8,
    fields: Pgn129025Fields,
}

#[derive(Debug, Serialize)]
struct Pgn129025Fields {
    #[serde(rename = "Latitude")]
    latitude: f64,
    #[serde(rename = "Longitude")]
    longitude: f64,
}

/// PGN 129026 - COG & SOG, Rapid Update
#[derive(Debug, Serialize)]
struct Pgn129026 {
    pgn: u32,
    src: String,
    dst: u8,
    prio: u8,
    fields: Pgn129026Fields,
}

#[derive(Debug, Serialize)]
struct Pgn129026Fields {
    #[serde(rename = "SID")]
    sid: u8,
    #[serde(rename = "COG Reference")]
    cog_reference: String,
    #[serde(rename = "COG")]
    cog: f64,
    #[serde(rename = "SOG")]
    sog: f64,
}

/// Handle incoming NMEA 0183 sentence
fn handle_nmea0183(state: &mut PluginState, event: &ServerEvent) {
    // The data field contains the NMEA sentence as a string
    let sentence = match event.data.as_str() {
        Some(s) => s,
        None => {
            if state.config.enable_debug {
                debug(&format!("NMEA data is not a string: {:?}", event.data));
            }
            state.parse_errors += 1;
            return;
        }
    };

    if state.config.enable_debug {
        debug(&format!("NMEA0183: {}", sentence));
    }

    // Parse the sentence type (after $ or ! and talker ID)
    let sentence = sentence.trim();
    if sentence.len() < 6 {
        return;
    }

    // Skip checksum for parsing (everything after *)
    let sentence_body = sentence
        .split('*')
        .next()
        .unwrap_or(sentence);

    // Get the sentence type (characters 3-5 after $ or !)
    let start = if sentence.starts_with('$') || sentence.starts_with('!') { 1 } else { 0 };
    if sentence_body.len() < start + 5 {
        return;
    }

    let sentence_type = &sentence_body[start + 2..start + 5];
    let fields: Vec<&str> = sentence_body.split(',').collect();

    match sentence_type {
        "RMC" => parse_rmc(state, &fields),
        "GGA" => parse_gga(state, &fields),
        _ => {
            // Ignore unsupported sentence types
        }
    }
}

/// Parse RMC (Recommended Minimum Navigation Information) sentence
/// $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
/// Fields: Time, Status, Lat, N/S, Lon, E/W, Speed(kn), Course, Date, MagVar, E/W
fn parse_rmc(state: &mut PluginState, fields: &[&str]) {
    if fields.len() < 10 {
        state.parse_errors += 1;
        return;
    }

    let status = fields.get(2).unwrap_or(&"V");
    if *status != "A" {
        // Not a valid fix
        return;
    }

    // Parse position
    let lat = parse_coordinate(fields.get(3).unwrap_or(&""), fields.get(4).unwrap_or(&""));
    let lon = parse_coordinate(fields.get(5).unwrap_or(&""), fields.get(6).unwrap_or(&""));

    // Parse speed (knots to m/s: 1 knot = 0.514444 m/s)
    let speed_kn: f64 = fields.get(7).unwrap_or(&"").parse().unwrap_or(0.0);
    let speed_ms = speed_kn * 0.514444;

    // Parse course (degrees)
    let course: f64 = fields.get(8).unwrap_or(&"").parse().unwrap_or(0.0);
    let course_rad = course * std::f64::consts::PI / 180.0;

    if let (Some(latitude), Some(longitude)) = (lat, lon) {
        // Emit PGN 129025 - Position, Rapid Update
        let pgn_129025 = Pgn129025 {
            pgn: 129025,
            src: state.config.source_id.clone(),
            dst: 255,
            prio: 2,
            fields: Pgn129025Fields {
                latitude,
                longitude,
            },
        };

        if emit_event("nmea2000JsonOut", &pgn_129025) {
            state.pgns_emitted += 1;
            if state.config.enable_debug {
                debug(&format!("Emitted PGN 129025: lat={}, lon={}", latitude, longitude));
            }
        }

        // Emit PGN 129026 - COG & SOG, Rapid Update
        let pgn_129026 = Pgn129026 {
            pgn: 129026,
            src: state.config.source_id.clone(),
            dst: 255,
            prio: 2,
            fields: Pgn129026Fields {
                sid: 0,
                cog_reference: "True".to_string(),
                cog: course_rad,
                sog: speed_ms,
            },
        };

        if emit_event("nmea2000JsonOut", &pgn_129026) {
            state.pgns_emitted += 1;
            if state.config.enable_debug {
                debug(&format!("Emitted PGN 129026: cog={:.1}deg, sog={:.2}m/s", course, speed_ms));
            }
        }
    }

    // Update status periodically
    if state.nmea0183_received % 60 == 0 {
        set_status(&format!(
            "Received: {}, Emitted: {}",
            state.nmea0183_received, state.pgns_emitted
        ));
    }
}

/// Parse GGA (Global Positioning System Fix Data) sentence
/// $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47
/// Fields: Time, Lat, N/S, Lon, E/W, Quality, NumSat, HDOP, Alt, M, GeoidSep, M, ...
fn parse_gga(state: &mut PluginState, fields: &[&str]) {
    if fields.len() < 10 {
        state.parse_errors += 1;
        return;
    }

    let quality: u8 = fields.get(6).unwrap_or(&"0").parse().unwrap_or(0);
    if quality == 0 {
        // No fix
        return;
    }

    // Parse position
    let lat = parse_coordinate(fields.get(2).unwrap_or(&""), fields.get(3).unwrap_or(&""));
    let lon = parse_coordinate(fields.get(4).unwrap_or(&""), fields.get(5).unwrap_or(&""));

    if let (Some(latitude), Some(longitude)) = (lat, lon) {
        // Emit PGN 129025 - Position, Rapid Update
        let pgn_129025 = Pgn129025 {
            pgn: 129025,
            src: state.config.source_id.clone(),
            dst: 255,
            prio: 2,
            fields: Pgn129025Fields {
                latitude,
                longitude,
            },
        };

        if emit_event("nmea2000JsonOut", &pgn_129025) {
            state.pgns_emitted += 1;
            if state.config.enable_debug {
                debug(&format!("Emitted PGN 129025 from GGA: lat={}, lon={}", latitude, longitude));
            }
        }
    }
}

/// Parse NMEA coordinate (DDDMM.MMMM format) to decimal degrees
fn parse_coordinate(coord: &str, hemisphere: &str) -> Option<f64> {
    if coord.is_empty() {
        return None;
    }

    // Find decimal point position
    let dot_pos = coord.find('.')?;

    // Degrees are everything before the last 2 digits before the decimal
    let deg_end = if dot_pos >= 2 { dot_pos - 2 } else { return None };

    let degrees: f64 = coord[..deg_end].parse().ok()?;
    let minutes: f64 = coord[deg_end..].parse().ok()?;

    let mut result = degrees + minutes / 60.0;

    // Apply hemisphere
    match hemisphere {
        "S" | "W" => result = -result,
        _ => {}
    }

    Some(result)
}

fn write_string(s: &str, ptr: *mut u8, max_len: usize) -> i32 {
    let bytes = s.as_bytes();
    let len = bytes.len().min(max_len);

    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
    }

    len as i32
}
