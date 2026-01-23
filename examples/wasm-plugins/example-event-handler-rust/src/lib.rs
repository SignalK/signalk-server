//! Event Handler WASM Plugin for Signal K
//!
//! A Rust implementation demonstrating server event handling:
//! - Subscribing to server events (SERVERSTATISTICS, VESSEL_INFO, etc.)
//! - Receiving and parsing event data
//! - Emitting custom PLUGIN_* events
//! - State tracking across events
//!
//! This plugin monitors SERVERSTATISTICS events and emits a custom
//! PLUGIN_HIGH_DELTA_RATE alert when the delta rate exceeds a threshold.

use std::cell::RefCell;
use serde::{Deserialize, Serialize};

// =============================================================================
// FFI Imports - Signal K WASM runtime host functions
// =============================================================================

#[link(wasm_import_module = "env")]
extern "C" {
    /// Log debug message
    fn sk_debug(ptr: *const u8, len: usize);

    /// Set plugin status message
    fn sk_set_status(ptr: *const u8, len: usize);

    /// Set plugin error message
    fn sk_set_error(ptr: *const u8, len: usize);

    /// Subscribe to server events
    /// event_types_ptr: JSON array of event types (e.g., '["SERVERSTATISTICS"]')
    /// Returns 1 on success, 0 on failure
    fn sk_subscribe_events(event_types_ptr: *const u8, event_types_len: usize) -> i32;

    /// Emit a custom event
    /// type_ptr: Event type (will be prefixed with PLUGIN_ if not already)
    /// data_ptr: JSON data for the event
    /// Returns 1 on success, 0 on failure
    fn sk_emit_event(
        type_ptr: *const u8,
        type_len: usize,
        data_ptr: *const u8,
        data_len: usize,
    ) -> i32;

    /// Get list of allowed event types (for debugging)
    fn sk_get_allowed_event_types(buf_ptr: *mut u8, buf_max_len: usize) -> i32;
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

fn subscribe_events(event_types: &[&str]) -> bool {
    let json = serde_json::to_string(event_types).unwrap_or_else(|_| "[]".to_string());
    unsafe { sk_subscribe_events(json.as_ptr(), json.len()) == 1 }
}

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

// =============================================================================
// Plugin State
// =============================================================================

thread_local! {
    static STATE: RefCell<PluginState> = RefCell::new(PluginState::default());
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginConfig {
    /// Delta rate threshold to trigger HIGH_DELTA_RATE alert (deltas/second)
    #[serde(default = "default_delta_rate_threshold")]
    delta_rate_threshold: f64,

    /// Enable debug logging of all received events
    #[serde(default)]
    enable_debug: bool,
}

fn default_delta_rate_threshold() -> f64 { 100.0 }

#[derive(Debug, Default)]
struct PluginState {
    config: PluginConfig,
    is_running: bool,

    // Statistics tracking
    events_received: u64,
    last_delta_rate: f64,
    high_rate_alert_active: bool,

    // Server info from events
    ws_clients: u32,
    uptime_seconds: f64,
}

// =============================================================================
// Memory Allocation for string passing
// =============================================================================

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

// =============================================================================
// Plugin Exports - Core plugin interface
// =============================================================================

static PLUGIN_ID: &str = "event-handler-rust";
static PLUGIN_NAME: &str = "Event Handler (Rust)";
static PLUGIN_SCHEMA: &str = r#"{
    "type": "object",
    "title": "Event Handler Configuration",
    "properties": {
        "deltaRateThreshold": {
            "type": "number",
            "title": "Delta Rate Threshold",
            "description": "Emit PLUGIN_HIGH_DELTA_RATE alert when server exceeds this rate (deltas/second)",
            "default": 100,
            "minimum": 10,
            "maximum": 10000
        },
        "enableDebug": {
            "type": "boolean",
            "title": "Enable Debug Logging",
            "description": "Log all received events (verbose)",
            "default": false
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
        s.events_received = 0;
        s.high_rate_alert_active = false;
    });

    debug(&format!(
        "Event Handler starting with threshold: {} deltas/sec",
        parsed_config.delta_rate_threshold
    ));

    // Subscribe to SERVERSTATISTICS events
    // This event is emitted every 5 seconds with server performance metrics
    if subscribe_events(&["SERVERSTATISTICS", "VESSEL_INFO"]) {
        debug("Subscribed to SERVERSTATISTICS and VESSEL_INFO events");
    } else {
        set_error("Failed to subscribe to server events");
        return 1;
    }

    set_status("Monitoring server events");
    0
}

#[no_mangle]
pub extern "C" fn plugin_stop() -> i32 {
    STATE.with(|state| {
        let mut s = state.borrow_mut();
        s.is_running = false;

        debug(&format!(
            "Event Handler stopping. Total events received: {}",
            s.events_received
        ));
    });

    set_status("Stopped");
    0
}

// =============================================================================
// Event Handler Export
// =============================================================================

/// Handle incoming server events
/// This function is called by the host when a subscribed event occurs
#[no_mangle]
pub extern "C" fn event_handler(event_ptr: *const u8, event_len: usize) {
    let event_json = unsafe {
        let slice = std::slice::from_raw_parts(event_ptr, event_len);
        String::from_utf8_lossy(slice).to_string()
    };

    // Parse the event
    let event: ServerEvent = match serde_json::from_str(&event_json) {
        Ok(e) => e,
        Err(e) => {
            debug(&format!("Failed to parse event: {}", e));
            return;
        }
    };

    STATE.with(|state| {
        let mut s = state.borrow_mut();
        s.events_received += 1;

        if s.config.enable_debug {
            debug(&format!(
                "Event received: type={}, from={:?}",
                event.event_type, event.from
            ));
        }

        match event.event_type.as_str() {
            "SERVERSTATISTICS" => handle_server_statistics(&mut s, &event),
            "VESSEL_INFO" => handle_vessel_info(&s, &event),
            _ => {
                if s.config.enable_debug {
                    debug(&format!("Unhandled event type: {}", event.event_type));
                }
            }
        }
    });
}

// =============================================================================
// Event Type Structures
// =============================================================================

#[derive(Debug, Deserialize)]
struct ServerEvent {
    #[serde(rename = "type")]
    event_type: String,
    from: Option<String>,
    data: serde_json::Value,
    timestamp: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerStatistics {
    delta_rate: Option<f64>,
    ws_clients: Option<u32>,
    uptime: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HighDeltaRateAlert {
    current_rate: f64,
    threshold: f64,
    ws_clients: u32,
    uptime_seconds: f64,
    message: String,
}

// =============================================================================
// Event Handlers
// =============================================================================

fn handle_server_statistics(state: &mut PluginState, event: &ServerEvent) {
    let stats: ServerStatistics = match serde_json::from_value(event.data.clone()) {
        Ok(s) => s,
        Err(e) => {
            debug(&format!("Failed to parse SERVERSTATISTICS: {}", e));
            return;
        }
    };

    // Update state with latest values
    if let Some(rate) = stats.delta_rate {
        state.last_delta_rate = rate;
    }
    if let Some(clients) = stats.ws_clients {
        state.ws_clients = clients;
    }
    if let Some(uptime) = stats.uptime {
        state.uptime_seconds = uptime;
    }

    // Check if delta rate exceeds threshold
    let rate = state.last_delta_rate;
    let threshold = state.config.delta_rate_threshold;

    if rate > threshold && !state.high_rate_alert_active {
        // Delta rate crossed threshold - emit alert
        state.high_rate_alert_active = true;

        let alert = HighDeltaRateAlert {
            current_rate: rate,
            threshold,
            ws_clients: state.ws_clients,
            uptime_seconds: state.uptime_seconds,
            message: format!(
                "Delta rate ({:.1}/s) exceeded threshold ({:.1}/s)",
                rate, threshold
            ),
        };

        if emit_event("HIGH_DELTA_RATE", &alert) {
            debug(&format!(
                "Emitted PLUGIN_HIGH_DELTA_RATE alert: {:.1} > {:.1}",
                rate, threshold
            ));
            set_status(&format!("Alert: High delta rate ({:.1}/s)", rate));
        }
    } else if rate <= threshold && state.high_rate_alert_active {
        // Delta rate dropped below threshold - clear alert
        state.high_rate_alert_active = false;

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct AlertCleared {
            current_rate: f64,
            threshold: f64,
            message: String,
        }

        let cleared = AlertCleared {
            current_rate: rate,
            threshold,
            message: format!(
                "Delta rate ({:.1}/s) returned to normal (threshold: {:.1}/s)",
                rate, threshold
            ),
        };

        if emit_event("HIGH_DELTA_RATE_CLEARED", &cleared) {
            debug("Emitted PLUGIN_HIGH_DELTA_RATE_CLEARED");
            set_status("Monitoring server events");
        }
    }

    // Update status periodically
    if state.events_received % 12 == 0 {
        // Every ~60 seconds (12 * 5s)
        set_status(&format!(
            "Delta rate: {:.1}/s, WS clients: {}, Uptime: {:.0}s",
            rate, state.ws_clients, state.uptime_seconds
        ));
    }
}

fn handle_vessel_info(state: &PluginState, event: &ServerEvent) {
    if state.config.enable_debug {
        debug(&format!("Vessel info changed: {:?}", event.data));
    }
    // Could emit a custom event when vessel info changes, e.g.:
    // emit_event("VESSEL_INFO_CHANGED", &event.data);
}

// =============================================================================
// Helper Functions
// =============================================================================

fn write_string(s: &str, ptr: *mut u8, max_len: usize) -> i32 {
    let bytes = s.as_bytes();
    let len = bytes.len().min(max_len);

    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, len);
    }

    len as i32
}
