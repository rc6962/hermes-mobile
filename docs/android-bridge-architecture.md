# Hermes Mobile Android Bridge Architecture

**Status:** design baseline for Phase 2, Task 6  
**Protocol version:** `0.1`  
**Scope:** existing Termux/Hermes runtime plus a narrowly scoped Android capability provider

## Goal

Hermes Mobile remains an Android frontend and capability provider for an existing Hermes installation. The Android bridge must not become a second agent runtime. The same bridge contract must remain usable if a managed Hermes runtime is added later.

## Layer boundary

```text
Android UI / native capability provider
  pairing, diagnostics, permission state, AccessibilityService,
  bounded device actions, explicit screenshot consent
              |
              | authenticated loopback bridge protocol v0.1
              v
Hermes runtime adapter
  ExistingTermuxRuntime now; ManagedEmbeddedRuntime later
              |
              v
Hermes orchestrator
  model calls, tools, memory, approvals, policy, scheduling
```

### Android owns

- User-visible pairing and bridge enablement state.
- Android permission and service lifecycle.
- Accessibility-tree capture and bounded device actions.
- Capability-level enable/disable state.
- Safe, metadata-only native diagnostics.

### The runtime adapter owns

- Detecting and selecting an existing Termux/Hermes installation.
- Starting, stopping, restarting, and diagnosing the runtime.
- Supplying the endpoint and separate bridge credential to the host plugin.
- Translating the protocol into the host's capability interface.

### Hermes owns

- Model-facing tool descriptions and discovery.
- Policy, approvals, allowlists, and user confirmation.
- Agent state, memory, scheduling, and audit policy.
- Deciding when a phone capability may be requested.

The Android app contains no LLM, arbitrary shell executor, autonomous scheduler, model-facing memory, or unrestricted intent dispatcher.

## Runtime selection

The existing-user path is primary:

```text
Usable Termux/Hermes detected -> reuse it
No usable installation       -> explain that managed mode is unavailable
```

A future managed runtime may replace only the runtime adapter. It must not require a change to the Android bridge routes or capability semantics.

## Trust boundaries

1. **User and Android UI** — the user explicitly pairs the app and enables sensitive capabilities.
2. **Android bridge** — accepts only authenticated, bounded requests on loopback.
3. **Termux host plugin** — applies model-facing policy and approvals before calling the bridge.
4. **Hermes orchestrator** — remains the sole authority for model/tool execution.

The Hermes API bearer credential and the Android bridge token are separate secrets. Neither is placed in a URL, exported Intent, screenshot, notification, exception, or normal log.

## Transport and lifecycle

- The bridge binds to `127.0.0.1` only.
- Every route, including status/health, requires `Authorization: Bearer <bridge-token>`.
- The bridge token is generated per installation and stored with Android Keystore-backed storage.
- Requests have bounded headers, body size, response size, and execution time.
- A bridge disconnect or service shutdown stops in-flight device work and reports a typed failure.
- The bridge starts disabled until the user enables the required Android service.
- No background auto-start is introduced by this contract.

## Phase 2 vertical slice

Implement in this order:

1. `bridge.status` and `accessibility.status` with safe metadata only.
2. Bounded `screen.read` accessibility-tree snapshots.
3. `node.find` over the most recent snapshot.
4. `node.tap` using an opaque snapshot-owned node ID.
5. `input.type` only into the currently focused editable node.
6. Explicit `system.back` and `system.home` actions.
7. `screen.capture` only after separate MediaProjection consent.

Each capability is independently enabled and appears in the host tool list only when both policy and Android availability allow it.

## Data minimization

Accessibility snapshots:

- cap node count and tree depth;
- truncate ordinary text;
- omit password-field text rather than replacing it with a recoverable value;
- use opaque, short-lived node IDs tied to a snapshot generation;
- omit raw view references and framework objects;
- never log the tree, focused text, typed text, clipboard, notifications, or pixels.

Screenshots are not part of the initial `screen.read` response. Pixel capture requires explicit user consent, bounded dimensions/quality, cancellation handling, and visible app state.

## Failure model

The bridge returns stable, safe error codes. It does not return stack traces, raw request bodies, token values, screen contents, or framework exception text. The host must treat a timeout, disconnected service, stale node ID, denied permission, and rejected action as distinct operational states.

## Non-goals for this milestone

- Arbitrary shell commands.
- Arbitrary intents, URLs, package components, or key-event injection.
- Clipboard, notifications, audio, overlays, SMS, contacts, location, or phone permissions.
- Silent MediaProjection or microphone access.
- Embedded Hermes/Python/Termux packaging.
- LAN exposure or remote pairing.

## Verification gates

Before native implementation expands:

- protocol validators and fixtures pass in the frontend test suite;
- the compiled manifest remains unchanged by this design-only slice;
- no credentials or secret-bearing example values are committed;
- malformed, oversized, unauthorized, stale-node, and disabled-capability cases have deterministic tests;
- later native work adds JVM protocol tests, emulator service/loopback tests, and real-device permission/action tests separately.
