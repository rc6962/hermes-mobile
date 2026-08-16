# Termux Android Bridge Plugin Boundary

**Status:** protocol/design placeholder for Phase 2, Task 6. No server or model-facing tools are implemented by this README.

## Responsibility

This plugin will be the host-side adapter between the existing Termux Hermes runtime and the Android capability bridge. It must remain an adapter, not a second policy engine or a shell proxy.

```text
Hermes orchestrator / tool policy
          |
          v
android-bridge-plugin
  typed routes, capability discovery, approvals,
  timeouts, redacted metadata-only audit events
          |
          | Authorization: Bearer <separate bridge token>
          v
Hermes Mobile Android bridge on 127.0.0.1:7070
```

The plugin must not:

- shell out to `curl` or interpolate model-controlled JSON into commands;
- accept a missing token as an unauthenticated fallback;
- expose arbitrary shell commands, intents, URLs, packages, coordinates, or key events;
- place bridge tokens in tool descriptions, URLs, logs, or error messages;
- expose a capability to the model when Android status or host policy says it is unavailable.

## Contract source

The wire contract is defined in [`docs/android-bridge-protocol.md`](../../docs/android-bridge-protocol.md). The architectural boundary is defined in [`docs/android-bridge-architecture.md`](../../docs/android-bridge-architecture.md).

The plugin should use a direct HTTP client and map the following protocol capabilities to narrowly scoped host tools:

- `bridge.status`
- `accessibility.status`
- `screen.read`
- `node.find`
- `node.tap`
- `input.type`
- `system.back`
- `system.home`
- `screen.capture` only after explicit user consent

## Runtime adapter boundary

The plugin receives its endpoint and bridge credential from the selected runtime adapter. It must not assume that Hermes is embedded in the APK. The first supported adapter is the existing Termux installation; a future managed adapter must be able to reuse the same plugin and protocol unchanged.

## Required implementation gates

Before adding model-facing tools:

1. Add typed request/response mapping and safe error normalization.
2. Add bounded request timeouts and response limits.
3. Add fake-server tests for authentication, malformed JSON, unsupported protocol versions, stale node IDs, disabled capabilities, and oversized responses.
4. Verify disabled capabilities are absent from the model-facing registry, not merely rejected after invocation.
5. Add metadata-only audit tests containing sentinel secrets and assert that neither arguments nor results are persisted.
6. Keep the Android bridge token in secure local storage; never commit it or print it.

## Deferred work

This directory intentionally contains no executable server yet. The next implementation task is the Android bridge status/permission seam in the APK, followed by the host adapter once the native contract has a real status endpoint. Do not add AccessibilityService permissions or background startup as part of this design-only milestone.
