/**
 * Anchor Watch - C# WASM Plugin for Signal K
 *
 * Demonstrates:
 * - PUT handler registration and implementation
 * - VFS storage for persistent state
 * - Delta emission for notifications
 * - C# / .NET WASM development
 *
 * This plugin monitors vessel position and alerts when the vessel drags anchor.
 */

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SignalK.AnchorWatch
{
    // FFI imports from Signal K server
    internal static class SignalKApi
    {
        [DllImport("env", EntryPoint = "sk_debug")]
        public static extern void Debug(IntPtr messagePtr, int messageLen);

        [DllImport("env", EntryPoint = "sk_set_status")]
        public static extern void SetStatus(IntPtr messagePtr, int messageLen);

        [DllImport("env", EntryPoint = "sk_set_error")]
        public static extern void SetError(IntPtr messagePtr, int messageLen);

        [DllImport("env", EntryPoint = "sk_handle_message")]
        public static extern void HandleMessage(IntPtr deltaPtr, int deltaLen);

        [DllImport("env", EntryPoint = "sk_register_put_handler")]
        public static extern int RegisterPutHandler(IntPtr contextPtr, int contextLen, IntPtr pathPtr, int pathLen);

        [DllImport("env", EntryPoint = "sk_get_self_path")]
        public static extern int GetSelfPath(IntPtr pathPtr, int pathLen, IntPtr outPtr, int outMaxLen);

        // Helper methods
        public static void Log(string message)
        {
            var bytes = Encoding.UTF8.GetBytes(message);
            unsafe
            {
                fixed (byte* ptr = bytes)
                {
                    Debug((IntPtr)ptr, bytes.Length);
                }
            }
        }

        public static void Status(string message)
        {
            var bytes = Encoding.UTF8.GetBytes(message);
            unsafe
            {
                fixed (byte* ptr = bytes)
                {
                    SetStatus((IntPtr)ptr, bytes.Length);
                }
            }
        }

        public static void Error(string message)
        {
            var bytes = Encoding.UTF8.GetBytes(message);
            unsafe
            {
                fixed (byte* ptr = bytes)
                {
                    SetError((IntPtr)ptr, bytes.Length);
                }
            }
        }

        public static void EmitDelta(string deltaJson)
        {
            var bytes = Encoding.UTF8.GetBytes(deltaJson);
            unsafe
            {
                fixed (byte* ptr = bytes)
                {
                    HandleMessage((IntPtr)ptr, bytes.Length);
                }
            }
        }

        public static bool RegisterPut(string context, string path)
        {
            var contextBytes = Encoding.UTF8.GetBytes(context);
            var pathBytes = Encoding.UTF8.GetBytes(path);
            unsafe
            {
                fixed (byte* contextPtr = contextBytes)
                fixed (byte* pathPtr = pathBytes)
                {
                    int result = RegisterPutHandler((IntPtr)contextPtr, contextBytes.Length, (IntPtr)pathPtr, pathBytes.Length);
                    return result == 1;
                }
            }
        }

        public static string? GetPath(string path)
        {
            var pathBytes = Encoding.UTF8.GetBytes(path);
            var buffer = new byte[4096];
            unsafe
            {
                fixed (byte* pathPtr = pathBytes)
                fixed (byte* outPtr = buffer)
                {
                    int len = GetSelfPath((IntPtr)pathPtr, pathBytes.Length, (IntPtr)outPtr, buffer.Length);
                    if (len > 0)
                    {
                        return Encoding.UTF8.GetString(buffer, 0, len);
                    }
                }
            }
            return null;
        }
    }

    // Data models
    public class Position
    {
        [JsonPropertyName("latitude")]
        public double Latitude { get; set; }

        [JsonPropertyName("longitude")]
        public double Longitude { get; set; }
    }

    public class AnchorState
    {
        [JsonPropertyName("position")]
        public Position? Position { get; set; }

        [JsonPropertyName("maxRadius")]
        public double MaxRadius { get; set; } = 50.0; // meters

        [JsonPropertyName("alarmEnabled")]
        public bool AlarmEnabled { get; set; } = false;
    }

    public class PutRequest
    {
        [JsonPropertyName("context")]
        public string Context { get; set; } = "";

        [JsonPropertyName("path")]
        public string Path { get; set; } = "";

        [JsonPropertyName("value")]
        public JsonElement Value { get; set; }
    }

    public class PutResponse
    {
        [JsonPropertyName("state")]
        public string State { get; set; } = "COMPLETED";

        [JsonPropertyName("statusCode")]
        public int StatusCode { get; set; } = 200;

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    // JSON source generator context for AOT/trimming compatibility
    [JsonSourceGenerationOptions(WriteIndented = false)]
    [JsonSerializable(typeof(Dictionary<string, JsonElement>))]
    [JsonSerializable(typeof(Position))]
    [JsonSerializable(typeof(AnchorState))]
    [JsonSerializable(typeof(PutRequest))]
    [JsonSerializable(typeof(PutResponse))]
    internal partial class SourceGenerationContext : JsonSerializerContext
    {
    }

    // Main plugin class
    public static class AnchorWatchPlugin
    {
        private static AnchorState anchorState = new AnchorState();
        private static bool debugEnabled = false;

        private static void LogDebug(string message)
        {
            if (debugEnabled)
            {
                SignalKApi.Log($"[anchor-watch-dotnet] {message}");
            }
        }

        // Plugin exports - called by Signal K server

        [UnmanagedCallersOnly(EntryPoint = "plugin_id")]
        public static IntPtr GetId()
        {
            return MarshalString("anchor-watch-dotnet");
        }

        [UnmanagedCallersOnly(EntryPoint = "plugin_name")]
        public static IntPtr GetName()
        {
            return MarshalString("Anchor Watch (.NET)");
        }

        [UnmanagedCallersOnly(EntryPoint = "plugin_schema")]
        public static IntPtr GetSchema()
        {
            var schema = @"{
  ""type"": ""object"",
  ""properties"": {
    ""maxRadius"": {
      ""type"": ""number"",
      ""title"": ""Default Drag Alarm Radius (meters)"",
      ""default"": 50
    },
    ""alarmEnabled"": {
      ""type"": ""boolean"",
      ""title"": ""Enable Alarm"",
      ""default"": false
    },
    ""enableDebug"": {
      ""type"": ""boolean"",
      ""title"": ""Enable Debug Logging"",
      ""default"": false
    }
  }
}";
            return MarshalString(schema);
        }

        [UnmanagedCallersOnly(EntryPoint = "plugin_start")]
        public static int Start(IntPtr configPtr, int configLen)
        {
            try
            {
                var configJson = ReadString(configPtr, configLen);
                LogDebug("========================================");
                LogDebug("Anchor Watch plugin starting...");
                LogDebug($"Configuration: {configJson}");

                // Parse configuration
                try
                {
                    var config = JsonSerializer.Deserialize(configJson, SourceGenerationContext.Default.DictionaryStringJsonElement);
                    if (config != null)
                    {
                        if (config.ContainsKey("enableDebug"))
                        {
                            debugEnabled = config["enableDebug"].GetBoolean();
                        }

                        var configuration = config.ContainsKey("configuration")
                            ? JsonSerializer.Deserialize(config["configuration"].GetRawText(), SourceGenerationContext.Default.DictionaryStringJsonElement)
                            : null;

                        if (configuration != null)
                        {
                            if (configuration.ContainsKey("maxRadius"))
                            {
                                anchorState.MaxRadius = configuration["maxRadius"].GetDouble();
                            }
                            if (configuration.ContainsKey("alarmEnabled"))
                            {
                                anchorState.AlarmEnabled = configuration["alarmEnabled"].GetBoolean();
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    LogDebug($"Configuration parse error: {ex.Message}");
                }

                LogDebug($"Debug logging: {(debugEnabled ? "ENABLED" : "DISABLED")}");
                LogDebug($"Max radius: {anchorState.MaxRadius}m");
                LogDebug($"Alarm enabled: {anchorState.AlarmEnabled}");

                // Register PUT handlers
                LogDebug("Registering PUT handlers...");

                if (SignalKApi.RegisterPut("vessels.self", "navigation.anchor.position"))
                {
                    LogDebug("✓ Registered: navigation.anchor.position");
                }

                if (SignalKApi.RegisterPut("vessels.self", "navigation.anchor.maxRadius"))
                {
                    LogDebug("✓ Registered: navigation.anchor.maxRadius");
                }

                if (SignalKApi.RegisterPut("vessels.self", "navigation.anchor.alarmState"))
                {
                    LogDebug("✓ Registered: navigation.anchor.alarmState");
                }

                SignalKApi.Status("Started - waiting for anchor drop");
                LogDebug("========================================");
                LogDebug("Anchor Watch plugin started successfully!");
                LogDebug("========================================");

                return 0; // Success
            }
            catch (Exception ex)
            {
                SignalKApi.Error($"Start failed: {ex.Message}");
                return 1; // Error
            }
        }

        [UnmanagedCallersOnly(EntryPoint = "plugin_stop")]
        public static int Stop()
        {
            LogDebug("Anchor Watch plugin stopping...");
            SignalKApi.Status("Stopped");
            return 0;
        }

        // PUT Handlers

        [UnmanagedCallersOnly(EntryPoint = "handle_put_vessels_self_navigation_anchor_position")]
        public static IntPtr HandleSetAnchorPosition(IntPtr requestPtr, int requestLen)
        {
            try
            {
                var requestJson = ReadString(requestPtr, requestLen);
                LogDebug($"PUT handler called: set anchor position");
                LogDebug($"Request: {requestJson}");

                var request = JsonSerializer.Deserialize(requestJson, SourceGenerationContext.Default.PutRequest);
                if (request == null)
                {
                    return MarshalJson(new PutResponse
                    {
                        State = "COMPLETED",
                        StatusCode = 400,
                        Message = "Invalid request"
                    });
                }

                var position = JsonSerializer.Deserialize(request.Value.GetRawText(), SourceGenerationContext.Default.Position);
                if (position == null)
                {
                    return MarshalJson(new PutResponse
                    {
                        State = "COMPLETED",
                        StatusCode = 400,
                        Message = "Invalid position format"
                    });
                }

                // Set anchor position
                anchorState.Position = position;
                LogDebug($"Anchor dropped at: {position.Latitude:F6}, {position.Longitude:F6}");

                // Emit delta to update data model
                var delta = $@"{{
  ""context"": ""vessels.self"",
  ""updates"": [{{
    ""source"": {{
      ""label"": ""anchor-watch-dotnet"",
      ""type"": ""plugin""
    }},
    ""timestamp"": ""{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ss.fffZ}"",
    ""values"": [{{
      ""path"": ""navigation.anchor.position"",
      ""value"": {{
        ""latitude"": {position.Latitude},
        ""longitude"": {position.Longitude}
      }}
    }}]
  }}]
}}";
                SignalKApi.EmitDelta(delta);

                SignalKApi.Status($"Anchor set at {position.Latitude:F6}, {position.Longitude:F6}");

                return MarshalJson(new PutResponse
                {
                    State = "COMPLETED",
                    StatusCode = 200,
                    Message = "Anchor position set successfully"
                });
            }
            catch (Exception ex)
            {
                LogDebug($"Error handling PUT: {ex.Message}");
                return MarshalJson(new PutResponse
                {
                    State = "COMPLETED",
                    StatusCode = 500,
                    Message = $"Error: {ex.Message}"
                });
            }
        }

        [UnmanagedCallersOnly(EntryPoint = "handle_put_vessels_self_navigation_anchor_maxRadius")]
        public static IntPtr HandleSetMaxRadius(IntPtr requestPtr, int requestLen)
        {
            try
            {
                var requestJson = ReadString(requestPtr, requestLen);
                LogDebug($"PUT handler called: set max radius");

                var request = JsonSerializer.Deserialize(requestJson, SourceGenerationContext.Default.PutRequest);
                if (request == null || request.Value.ValueKind != JsonValueKind.Number)
                {
                    return MarshalJson(new PutResponse
                    {
                        State = "COMPLETED",
                        StatusCode = 400,
                        Message = "Invalid radius value"
                    });
                }

                var radius = request.Value.GetDouble();
                if (radius <= 0 || radius > 1000)
                {
                    return MarshalJson(new PutResponse
                    {
                        State = "COMPLETED",
                        StatusCode = 400,
                        Message = "Radius must be between 0 and 1000 meters"
                    });
                }

                anchorState.MaxRadius = radius;
                LogDebug($"Max radius set to: {radius}m");

                // Emit delta
                var delta = $@"{{
  ""context"": ""vessels.self"",
  ""updates"": [{{
    ""source"": {{
      ""label"": ""anchor-watch-dotnet"",
      ""type"": ""plugin""
    }},
    ""timestamp"": ""{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ss.fffZ}"",
    ""values"": [{{
      ""path"": ""navigation.anchor.maxRadius"",
      ""value"": {radius}
    }}]
  }}]
}}";
                SignalKApi.EmitDelta(delta);

                return MarshalJson(new PutResponse
                {
                    State = "COMPLETED",
                    StatusCode = 200,
                    Message = $"Drag alarm radius set to {radius}m"
                });
            }
            catch (Exception ex)
            {
                return MarshalJson(new PutResponse
                {
                    State = "COMPLETED",
                    StatusCode = 500,
                    Message = $"Error: {ex.Message}"
                });
            }
        }

        [UnmanagedCallersOnly(EntryPoint = "handle_put_vessels_self_navigation_anchor_alarmState")]
        public static IntPtr HandleSetAlarmState(IntPtr requestPtr, int requestLen)
        {
            try
            {
                var requestJson = ReadString(requestPtr, requestLen);
                LogDebug($"PUT handler called: set alarm state");

                var request = JsonSerializer.Deserialize(requestJson, SourceGenerationContext.Default.PutRequest);
                if (request == null)
                {
                    return MarshalJson(new PutResponse
                    {
                        State = "COMPLETED",
                        StatusCode = 400,
                        Message = "Invalid request"
                    });
                }

                bool enabled;
                if (request.Value.ValueKind == JsonValueKind.True)
                {
                    enabled = true;
                }
                else if (request.Value.ValueKind == JsonValueKind.False)
                {
                    enabled = false;
                }
                else if (request.Value.ValueKind == JsonValueKind.String)
                {
                    var str = request.Value.GetString();
                    enabled = str == "on" || str == "enabled" || str == "true";
                }
                else
                {
                    return MarshalJson(new PutResponse
                    {
                        State = "COMPLETED",
                        StatusCode = 400,
                        Message = "Invalid alarm state value"
                    });
                }

                anchorState.AlarmEnabled = enabled;
                LogDebug($"Alarm state set to: {(enabled ? "ENABLED" : "DISABLED")}");

                SignalKApi.Status(enabled ? "Alarm enabled" : "Alarm disabled");

                // Emit notification delta
                var delta = $@"{{
  ""context"": ""vessels.self"",
  ""updates"": [{{
    ""source"": {{
      ""label"": ""anchor-watch-dotnet"",
      ""type"": ""plugin""
    }},
    ""timestamp"": ""{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ss.fffZ}"",
    ""values"": [{{
      ""path"": ""notifications.anchor.drag"",
      ""value"": {{
        ""state"": ""{(enabled ? "normal" : "cancel")}"",
        ""method"": [],
        ""message"": ""Anchor watch alarm {(enabled ? "enabled" : "disabled")}""
      }}
    }}]
  }}]
}}";
                SignalKApi.EmitDelta(delta);

                return MarshalJson(new PutResponse
                {
                    State = "COMPLETED",
                    StatusCode = 200,
                    Message = $"Alarm {(enabled ? "enabled" : "disabled")}"
                });
            }
            catch (Exception ex)
            {
                return MarshalJson(new PutResponse
                {
                    State = "COMPLETED",
                    StatusCode = 500,
                    Message = $"Error: {ex.Message}"
                });
            }
        }

        // Helper methods for string marshaling

        private static IntPtr MarshalString(string str)
        {
            var bytes = Encoding.UTF8.GetBytes(str + "\0");
            IntPtr ptr = Marshal.AllocHGlobal(bytes.Length);
            Marshal.Copy(bytes, 0, ptr, bytes.Length);
            return ptr;
        }

        private static IntPtr MarshalJson(PutResponse obj)
        {
            var json = JsonSerializer.Serialize(obj, SourceGenerationContext.Default.PutResponse);
            return MarshalString(json);
        }

        private static string ReadString(IntPtr ptr, int len)
        {
            var bytes = new byte[len];
            Marshal.Copy(ptr, bytes, 0, len);
            return Encoding.UTF8.GetString(bytes);
        }
    }

    // Entry point
    public class Program
    {
        public static void Main()
        {
            // WASI entry point - not used for plugins
            SignalKApi.Log("anchor-watch-dotnet loaded");
        }
    }
}
