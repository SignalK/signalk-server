//! Anchor Watch WASM Plugin for Signal K
//!
//! A Rust implementation demonstrating:
//! - WASM plugin architecture with raw FFI exports
//! - PUT handler registration and handling
//! - Custom HTTP endpoints (REST API)
//! - Delta message emission
//! - Plugin configuration via JSON schema

use std::cell::RefCell;
use std::f64::consts::PI;
use serde::{Deserialize, Serialize};

// =============================================================================
// FFI Imports - These must match what the SignalK WASM runtime provides in "env"
// =============================================================================

#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_debug(ptr: *const u8, len: usize);
    fn sk_set_status(ptr: *const u8, len: usize);
    fn sk_set_error(ptr: *const u8, len: usize);
    fn sk_handle_message(ptr: *const u8, len: usize);
    fn sk_register_put_handler(context_ptr: *const u8, context_len: usize, path_ptr: *const u8, path_len: usize) -> i32;
}

// =============================================================================
// Helper wrappers for FFI functions
// =============================================================================

fn debug(msg: &str) {
    unsafe { sk_debug(msg.as_ptr(), msg.len()); }
}

fn set_status(msg: &str) {
    unsafe { sk_set_status(msg.as_ptr(), msg.len()); }
}

fn set_error(msg: &str) {
    unsafe { sk_set_error(msg.as_ptr(), msg.len()); }
}

fn handle_message(msg: &str) {
    unsafe { sk_handle_message(msg.as_ptr(), msg.len()); }
}

fn register_put_handler(context: &str, path: &str) -> i32 {
    unsafe { sk_register_put_handler(context.as_ptr(), context.len(), path.as_ptr(), path.len()) }
}

// =============================================================================
// Plugin State
// =============================================================================

thread_local! {
    static STATE: RefCell<PluginState> = RefCell::new(PluginState::default());
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginConfig {
    #[serde(default)]
    anchor_lat: f64,
    #[serde(default)]
    anchor_lon: f64,
    #[serde(default = "default_max_radius")]
    max_radius: f64,
    #[serde(default = "default_interval")]
    check_interval: u32,
}

fn default_max_radius() -> f64 { 50.0 }
fn default_interval() -> u32 { 10 }

#[derive(Debug, Default)]
struct PluginState {
    config: PluginConfig,
    is_running: bool,
    #[allow(dead_code)]
    last_distance: f64,
    alarm_active: bool,
}

// =============================================================================
// Memory Allocation for string passing
// =============================================================================

/// Allocate memory for string passing from host
#[no_mangle]
pub extern "C" fn allocate(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Deallocate memory
#[no_mangle]
pub extern "C" fn deallocate(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

// =============================================================================
// Plugin Exports - Core plugin interface
// =============================================================================

static PLUGIN_ID: &str = "anchor-watch-rust";
static PLUGIN_NAME: &str = "Anchor Watch (Rust)";
static PLUGIN_SCHEMA: &str = r#"{
    "type": "object",
    "title": "Anchor Watch Configuration",
    "properties": {
        "anchorLat": {
            "type": "number",
            "title": "Anchor Latitude",
            "description": "Latitude where the anchor was dropped (degrees)",
            "default": 0
        },
        "anchorLon": {
            "type": "number",
            "title": "Anchor Longitude",
            "description": "Longitude where the anchor was dropped (degrees)",
            "default": 0
        },
        "maxRadius": {
            "type": "number",
            "title": "Maximum Radius (meters)",
            "description": "Alert if vessel moves beyond this distance from anchor",
            "default": 50,
            "minimum": 10,
            "maximum": 1000
        },
        "checkInterval": {
            "type": "integer",
            "title": "Check Interval (seconds)",
            "description": "How often to check vessel position",
            "default": 10,
            "minimum": 1,
            "maximum": 300
        }
    },
    "required": ["maxRadius"]
}"#;

/// Return the plugin ID
#[no_mangle]
pub extern "C" fn plugin_id(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_ID, out_ptr, out_max_len)
}

/// Return the plugin name
#[no_mangle]
pub extern "C" fn plugin_name(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_NAME, out_ptr, out_max_len)
}

/// Return the plugin JSON schema
#[no_mangle]
pub extern "C" fn plugin_schema(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    write_string(PLUGIN_SCHEMA, out_ptr, out_max_len)
}

/// Start the plugin with configuration
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
        s.alarm_active = false;
    });

    debug(&format!(
        "Anchor Watch started: anchor=({}, {}), radius={}m",
        parsed_config.anchor_lat,
        parsed_config.anchor_lon,
        parsed_config.max_radius
    ));

    // Register PUT handlers
    if register_put_handler("vessels.self", "navigation.anchor.position") == 1 {
        debug("Registered PUT handler for navigation.anchor.position");
    }
    if register_put_handler("vessels.self", "navigation.anchor.maxRadius") == 1 {
        debug("Registered PUT handler for navigation.anchor.maxRadius");
    }
    if register_put_handler("vessels.self", "navigation.anchor.state") == 1 {
        debug("Registered PUT handler for navigation.anchor.state");
    }

    // Plugin enabled = anchor watch active
    set_status("Anchor watch active");
    emit_anchor_state(true, parsed_config.anchor_lat, parsed_config.anchor_lon, parsed_config.max_radius);

    0
}

/// Stop the plugin
#[no_mangle]
pub extern "C" fn plugin_stop() -> i32 {
    STATE.with(|state| {
        let mut s = state.borrow_mut();
        s.is_running = false;
    });

    // Plugin stopped = anchor watch disabled
    emit_anchor_state(false, 0.0, 0.0, 0.0);
    debug("Anchor Watch stopped");
    set_status("Stopped");

    0
}

// =============================================================================
// PUT Handlers
// =============================================================================

/// Handle PUT request for navigation.anchor.position
#[no_mangle]
pub extern "C" fn handle_put_vessels_self_navigation_anchor_position(
    value_ptr: *const u8,
    value_len: usize,
    response_ptr: *mut u8,
    response_max_len: usize,
) -> i32 {
    let value_json = unsafe {
        let slice = std::slice::from_raw_parts(value_ptr, value_len);
        String::from_utf8_lossy(slice).to_string()
    };

    debug(&format!("PUT navigation.anchor.position: {}", value_json));

    #[derive(Deserialize)]
    struct Position {
        latitude: f64,
        longitude: f64,
    }

    let result = match serde_json::from_str::<Position>(&value_json) {
        Ok(pos) => {
            STATE.with(|state| {
                let mut s = state.borrow_mut();
                s.config.anchor_lat = pos.latitude;
                s.config.anchor_lon = pos.longitude;

                emit_anchor_state(
                    s.is_running, // Plugin running = anchor watch active
                    pos.latitude,
                    pos.longitude,
                    s.config.max_radius
                );
            });

            set_status(&format!("Anchor position set: ({:.6}, {:.6})", pos.latitude, pos.longitude));
            r#"{"state":"COMPLETED","statusCode":200}"#.to_string()
        }
        Err(e) => {
            set_error(&format!("Invalid position: {}", e));
            format!(r#"{{"state":"COMPLETED","statusCode":400,"message":"Invalid position format: {}"}}"#, e)
        }
    };

    write_string(&result, response_ptr, response_max_len)
}

/// Handle PUT request for navigation.anchor.maxRadius
#[no_mangle]
pub extern "C" fn handle_put_vessels_self_navigation_anchor_maxRadius(
    value_ptr: *const u8,
    value_len: usize,
    response_ptr: *mut u8,
    response_max_len: usize,
) -> i32 {
    let value_json = unsafe {
        let slice = std::slice::from_raw_parts(value_ptr, value_len);
        String::from_utf8_lossy(slice).to_string()
    };

    debug(&format!("PUT navigation.anchor.maxRadius: {}", value_json));

    let result = match serde_json::from_str::<f64>(&value_json) {
        Ok(radius) if radius >= 10.0 && radius <= 1000.0 => {
            STATE.with(|state| {
                let mut s = state.borrow_mut();
                s.config.max_radius = radius;

                emit_anchor_state(
                    s.is_running, // Plugin running = anchor watch active
                    s.config.anchor_lat,
                    s.config.anchor_lon,
                    radius
                );
            });

            set_status(&format!("Max radius set: {}m", radius));
            r#"{"state":"COMPLETED","statusCode":200}"#.to_string()
        }
        Ok(_) => {
            set_error("Radius must be between 10 and 1000 meters");
            r#"{"state":"COMPLETED","statusCode":400,"message":"Radius must be between 10 and 1000 meters"}"#.to_string()
        }
        Err(e) => {
            set_error(&format!("Invalid radius: {}", e));
            format!(r#"{{"state":"COMPLETED","statusCode":400,"message":"Invalid radius format: {}"}}"#, e)
        }
    };

    write_string(&result, response_ptr, response_max_len)
}

/// Handle PUT request for navigation.anchor.state
/// Note: Anchor watch state is controlled by enabling/disabling the plugin
#[no_mangle]
pub extern "C" fn handle_put_vessels_self_navigation_anchor_state(
    value_ptr: *const u8,
    value_len: usize,
    response_ptr: *mut u8,
    response_max_len: usize,
) -> i32 {
    let value_json = unsafe {
        let slice = std::slice::from_raw_parts(value_ptr, value_len);
        String::from_utf8_lossy(slice).to_string()
    };

    debug(&format!("PUT navigation.anchor.state: {} (state controlled by plugin enable/disable)", value_json));

    // Anchor watch state is controlled by enabling/disabling the plugin itself
    // This PUT handler is informational only - actual state change requires plugin restart
    let result = r#"{"state":"COMPLETED","statusCode":200,"message":"Anchor watch state is controlled by enabling/disabling the plugin"}"#;
    write_string(result, response_ptr, response_max_len)
}

// =============================================================================
// HTTP Endpoints - Custom REST API
// =============================================================================

/// Export HTTP endpoint definitions
/// Returns JSON array of endpoint definitions
#[no_mangle]
pub extern "C" fn http_endpoints(out_ptr: *mut u8, out_max_len: usize) -> i32 {
    let endpoints = r#"[
        {"method": "GET", "path": "/api/status", "handler": "http_get_status"},
        {"method": "GET", "path": "/api/position", "handler": "http_get_position"},
        {"method": "POST", "path": "/api/drop", "handler": "http_post_drop"}
    ]"#;
    write_string(endpoints, out_ptr, out_max_len)
}

/// GET /api/status - Return current anchor watch status
#[no_mangle]
pub extern "C" fn http_get_status(
    _request_ptr: *const u8,
    _request_len: usize,
    response_ptr: *mut u8,
    response_max_len: usize,
) -> i32 {
    debug("HTTP GET /api/status");

    let response = STATE.with(|state| {
        let s = state.borrow();
        format!(
            r#"{{"statusCode":200,"headers":{{"Content-Type":"application/json"}},"body":"{{\"running\":{},\"alarmActive\":{},\"position\":{{\"latitude\":{},\"longitude\":{}}},\"maxRadius\":{},\"checkInterval\":{}}}"}}"#,
            s.is_running,
            s.alarm_active,
            s.config.anchor_lat,
            s.config.anchor_lon,
            s.config.max_radius,
            s.config.check_interval
        )
    });

    write_string(&response, response_ptr, response_max_len)
}

/// GET /api/position - Return current anchor position
#[no_mangle]
pub extern "C" fn http_get_position(
    _request_ptr: *const u8,
    _request_len: usize,
    response_ptr: *mut u8,
    response_max_len: usize,
) -> i32 {
    debug("HTTP GET /api/position");

    let response = STATE.with(|state| {
        let s = state.borrow();
        format!(
            r#"{{"statusCode":200,"headers":{{"Content-Type":"application/json"}},"body":"{{\"latitude\":{},\"longitude\":{},\"maxRadius\":{}}}"}}"#,
            s.config.anchor_lat,
            s.config.anchor_lon,
            s.config.max_radius
        )
    });

    write_string(&response, response_ptr, response_max_len)
}

/// POST /api/drop - Drop anchor at specified position
#[no_mangle]
pub extern "C" fn http_post_drop(
    request_ptr: *const u8,
    request_len: usize,
    response_ptr: *mut u8,
    response_max_len: usize,
) -> i32 {
    debug("HTTP POST /api/drop");

    // Read request context
    let request_json = unsafe {
        let slice = std::slice::from_raw_parts(request_ptr, request_len);
        String::from_utf8_lossy(slice).to_string()
    };

    debug(&format!("Request: {}", request_json));

    // Parse request to get body
    #[derive(Deserialize)]
    struct RequestContext {
        body: Option<DropRequest>,
    }

    #[derive(Deserialize)]
    struct DropRequest {
        latitude: f64,
        longitude: f64,
        #[serde(default = "default_max_radius")]
        #[serde(rename = "maxRadius")]
        max_radius: f64,
    }

    let response = match serde_json::from_str::<RequestContext>(&request_json) {
        Ok(ctx) => {
            match ctx.body {
                Some(drop_req) => {
                    // Validate coordinates
                    if drop_req.latitude < -90.0 || drop_req.latitude > 90.0 {
                        return write_string(
                            r#"{"statusCode":400,"headers":{"Content-Type":"application/json"},"body":"{\"error\":\"Invalid latitude. Must be between -90 and 90.\"}"}"#,
                            response_ptr,
                            response_max_len
                        );
                    }
                    if drop_req.longitude < -180.0 || drop_req.longitude > 180.0 {
                        return write_string(
                            r#"{"statusCode":400,"headers":{"Content-Type":"application/json"},"body":"{\"error\":\"Invalid longitude. Must be between -180 and 180.\"}"}"#,
                            response_ptr,
                            response_max_len
                        );
                    }

                    // Update state
                    STATE.with(|state| {
                        let mut s = state.borrow_mut();
                        s.config.anchor_lat = drop_req.latitude;
                        s.config.anchor_lon = drop_req.longitude;
                        s.config.max_radius = drop_req.max_radius;
                        s.alarm_active = false;
                    });

                    // Emit delta to Signal K
                    emit_anchor_state(true, drop_req.latitude, drop_req.longitude, drop_req.max_radius);
                    set_status(&format!("Anchor dropped at ({:.6}, {:.6})", drop_req.latitude, drop_req.longitude));

                    format!(
                        r#"{{"statusCode":200,"headers":{{"Content-Type":"application/json"}},"body":"{{\"success\":true,\"message\":\"Anchor dropped\",\"position\":{{\"latitude\":{},\"longitude\":{}}},\"maxRadius\":{}}}"}}"#,
                        drop_req.latitude,
                        drop_req.longitude,
                        drop_req.max_radius
                    )
                }
                None => {
                    r#"{"statusCode":400,"headers":{"Content-Type":"application/json"},"body":"{\"error\":\"Missing request body. Expected {latitude, longitude, maxRadius?}\"}"}"#.to_string()
                }
            }
        }
        Err(e) => {
            debug(&format!("Failed to parse request: {}", e));
            format!(
                r#"{{"statusCode":400,"headers":{{"Content-Type":"application/json"}},"body":"{{\"error\":\"Invalid request format: {}\"}}"}}"#,
                e.to_string().replace('"', "\\\"")
            )
        }
    };

    write_string(&response, response_ptr, response_max_len)
}

// =============================================================================
// Helper Functions
// =============================================================================

fn emit_anchor_state(enabled: bool, lat: f64, lon: f64, radius: f64) {
    let state_value = if enabled { "on" } else { "off" };

    // Note: Do not include source or timestamp - the server automatically sets
    // $source to the plugin ID and fills in timestamp with current time.
    let delta = if enabled && (lat != 0.0 || lon != 0.0) {
        format!(
            r#"{{"context":"vessels.self","updates":[{{"values":[{{"path":"navigation.anchor.position","value":{{"latitude":{},"longitude":{}}}}},{{"path":"navigation.anchor.maxRadius","value":{}}},{{"path":"navigation.anchor.state","value":"{}"}}]}}]}}"#,
            lat, lon, radius, state_value
        )
    } else {
        format!(
            r#"{{"context":"vessels.self","updates":[{{"values":[{{"path":"navigation.anchor.state","value":"{}"}}]}}]}}"#,
            state_value
        )
    };

    handle_message(&delta);
}

fn write_string(s: &str, ptr: *mut u8, max_len: usize) -> i32 {
    let bytes = s.as_bytes();
    let len = bytes.len().min(max_len);

    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
    }

    len as i32
}

/// Calculate distance between two points using Haversine formula (meters)
#[allow(dead_code)]
fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const EARTH_RADIUS_M: f64 = 6_371_000.0;

    let lat1_rad = lat1 * PI / 180.0;
    let lat2_rad = lat2 * PI / 180.0;
    let delta_lat = (lat2 - lat1) * PI / 180.0;
    let delta_lon = (lon2 - lon1) * PI / 180.0;

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();

    EARTH_RADIUS_M * c
}
