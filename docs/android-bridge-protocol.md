# Hermes Mobile Android Bridge Protocol v0.1

This document defines the runtime-neutral local capability protocol. It is a contract for the Android provider and the Termux/Hermes host adapter; it is not an implementation of either side.

## 1. Transport and authentication

- Base address: `http://127.0.0.1:7070`
- Transport: HTTP/1.1 JSON over loopback.
- Every request, including status, requires:

  ```http
  Authorization: Bearer <bridge-token>
  Content-Type: application/json
  X-Hermes-Bridge-Version: 0.1
  X-Hermes-Request-Id: <opaque-request-id>
  ```

- `GET` requests may omit `Content-Type` when they have no body.
- The bridge rejects non-loopback binds, unsupported transfer encodings, missing `Content-Length` for bodies, malformed JSON, and unsupported protocol versions.
- The bridge token is distinct from the Hermes API bearer token and is stored outside the web bundle.

The request ID is for correlation only. It must not contain a token, screen text, typed text, or model-controlled free-form data.

## 2. Limits

| Item | Limit | Behavior when exceeded |
|---|---:|---|
| Header line | 8 KiB | `headers_too_large` |
| Header count | 64 | `headers_too_large` |
| JSON request body | 64 KiB | `request_body_too_large` |
| JSON response | 512 KiB | `response_too_large` |
| Socket/action timeout | 5 seconds | `request_timeout` |
| Accessibility nodes | 256 | response is marked `truncated` |
| Accessibility depth | 16 | response is marked `truncated` |
| Ordinary node text | 512 UTF-16 code units | text is truncated and marked |
| `input.type` text | 4,096 UTF-16 code units | `text_too_long` |
| Snapshot lifetime | 60 seconds | node IDs become stale |

The implementation may choose stricter limits. It must never silently increase these limits for model-controlled requests.

## 3. Response envelope

Successful responses are JSON objects and include:

```json
{
  "protocol_version": "0.1",
  "request_id": "req_123",
  "data": {}
}
```

Errors use this safe shape:

```json
{
  "protocol_version": "0.1",
  "request_id": "req_123",
  "error": {
    "code": "permission_denied",
    "message": "Accessibility service is disabled"
  }
}
```

`message` is safe for display and logs. It must not include request bodies, credentials, screen text, typed text, stack traces, or framework exception details.

## 4. Capabilities and routes

The host exposes a capability to Hermes only when the bridge reports it available and host policy permits it.

| Capability | Method | Route | Initial state |
|---|---|---|---|
| `bridge.status` | `GET` | `/v1/bridge/status` | enabled |
| `accessibility.status` | `GET` | `/v1/accessibility/status` | enabled |
| `screen.read` | `GET` | `/v1/screen/read` | disabled until service enabled |
| `node.find` | `POST` | `/v1/node/find` | follows `screen.read` |
| `node.tap` | `POST` | `/v1/node/tap` | follows permission/policy |
| `input.type` | `POST` | `/v1/input/type` | focused editable node only |
| `system.back` | `POST` | `/v1/system/back` | explicit host policy |
| `system.home` | `POST` | `/v1/system/home` | explicit host policy |
| `screen.capture` | `POST` | `/v1/screen/capture` | disabled until MediaProjection consent |

There is no generic `/action`, shell, intent, URL, package-launch, key-event, or proxy route in v0.1.

## 5. Status

`GET /v1/bridge/status` returns safe metadata:

```json
{
  "protocol_version": "0.1",
  "request_id": "req_123",
  "data": {
    "bridge": "ready",
    "service_connected": true,
    "android_api_level": 36,
    "capabilities": ["bridge.status", "accessibility.status", "screen.read"],
    "disabled_capabilities": ["screen.capture"]
  }
}
```

Allowed status values are `ready`, `disabled`, `disconnected`, and `stopping`. Status never includes the package list, current app, screen text, or token state beyond a boolean availability result.

## 6. Accessibility snapshot

`GET /v1/screen/read` returns a bounded tree flattened into nodes:

```json
{
  "protocol_version": "0.1",
  "request_id": "req_124",
  "data": {
    "snapshot_id": "snap_abc",
    "generated_at_ms": 1730000000000,
    "truncated": false,
    "nodes": [
      {
        "node_id": "node_1",
        "parent_id": null,
        "depth": 0,
        "class_name": "android.widget.Button",
        "bounds": {"left": 0, "top": 120, "right": 480, "bottom": 200},
        "clickable": true,
        "editable": false,
        "enabled": true,
        "visible": true,
        "text": "Continue",
        "text_truncated": false,
        "password": false
      }
    ]
  }
}
```

`node_id` is opaque, unique only within the snapshot lifetime, and cannot be used after `snapshot_id` expires. Password nodes have `password: true` and **must omit `text` entirely**. The bridge never returns raw Android node handles.

## 7. Node search and tap

Search is bounded and operates only on the latest snapshot:

```json
{"snapshot_id":"snap_abc","text":"Continue","clickable":true,"limit":8}
```

The response returns matching node summaries, not framework objects. Tap requests must identify both `snapshot_id` and `node_id`:

```json
{"snapshot_id":"snap_abc","node_id":"node_1"}
```

A stale, invisible, disabled, or non-clickable node returns `409 action_rejected` or `409 node_stale`; it is never silently retargeted by coordinates.

## 8. Focused text input

`input.type` accepts only:

```json
{"text":"example"}
```

The Android service must verify that the current focused node is editable, enabled, visible, and not a password field unless a future explicit password-input capability is approved. It uses a bounded set-text operation, not arbitrary key-event simulation. The request and resulting text are never logged.

## 9. System actions

`system.back` and `system.home` use empty JSON bodies and return:

```json
{"accepted":true}
```

They are separate routes so host policy can allow one without implicitly allowing the other. A disabled or disconnected service returns a typed error.

## 10. Screenshot consent

`screen.capture` is not an alias for `screen.read`. It requires a current user-approved MediaProjection session, an explicit size/quality bound, cancellation handling, and visible in-app state. Until then it returns `capability_disabled` or `permission_denied`. Pixel data is response-bounded and never written to normal logs or persistent audit records.

## 11. Error codes

Stable v0.1 codes include:

```text
unauthorized
unsupported_protocol
malformed_request
invalid_json
field_required
invalid_field
headers_too_large
request_body_too_large
response_too_large
request_timeout
capability_disabled
permission_denied
service_disconnected
snapshot_not_found
node_stale
node_not_found
action_rejected
text_too_long
bridge_stopping
bridge_error
```

HTTP mapping is conventional: `401` for authentication, `400` for malformed/invalid requests, `404` for unknown routes or snapshot/node lookup, `409` for stale/rejected actions, `413` for body/response limits, `408` for timeout, and `500` only for a safe generic bridge failure.

## 12. Logging and compatibility

Default logs contain metadata only: route name, capability, success/failure code, duration, and request ID. They never contain authorization headers, request/response bodies, screen trees, screenshots, typed text, clipboard values, notifications, or stack traces.

Unknown response fields must be ignored. A future `0.1.x` revision may add optional fields without changing existing semantics. A breaking change requires a new protocol major/minor version and explicit negotiation failure rather than silent fallback.
