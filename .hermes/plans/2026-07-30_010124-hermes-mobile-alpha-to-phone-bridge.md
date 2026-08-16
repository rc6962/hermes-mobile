# Hermes Mobile Alpha-to-Phone-Bridge Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Stabilize Hermes Mobile as a reliable frontend for an existing Termux Hermes installation, then add a secure Android phone-control bridge that can later be reused by an embedded self-contained Hermes runtime.

**Architecture:** Keep the Android UI, Hermes runtime, and phone capabilities as separate layers. In the alpha, the runtime is the user’s existing Hermes installation in Termux. Hermes Mobile owns the Android UI, pairing, diagnostics, and native phone bridge; Hermes in Termux owns reasoning, tools, memory, approvals, and policy. A future managed runtime can replace only the runtime adapter.

**Tech Stack:** React/Vite/TypeScript/Vitest, Capacitor Android, Java/Kotlin Android services, authenticated loopback HTTP/RPC, Android AccessibilityService and explicit Android permissions.

---

## Current context

Repository: `D:/Hermes/hermes-mobile`

Current branch: `main`

Latest committed source: `0f8b1a3 fix: use native HTTP for Hermes JSON requests`

Current working-tree changes that must be preserved and resolved deliberately:

- `mobile/src/components/SessionDrawer.tsx`
- `mobile/src/components/__tests__/SessionDrawer.test.tsx`
- `mobile/src/lib/__tests__/hermes-api.test.ts`
- `mobile/src/styles.css`
- untracked `.hermes/desktop-attachments/` and `.tmp/` inspection artifacts

Known product decisions:

- Prefer an existing Termux/Hermes installation.
- Keep Hermes bound to `127.0.0.1`.
- Use authenticated local transport.
- Do not expose arbitrary shell execution through the APK.
- Add Android phone control as a capability layer, not as a second agent runtime.
- Add an embedded Hermes runtime only after the Termux-backed product is stable and polished.

Known technical issue:

- JSON requests use native Capacitor HTTP.
- SSE still uses browser `fetch`.
- The latest Hermes API test modification has not yet been fully repaired/validated.
- The user has observed intermittent chat `Failed to fetch` errors and possible existing-session/run routing confusion.

---

## Phase 1: Finish the current Termux-backed alpha

### Task 1: Re-run and repair the Hermes API transport tests

**Objective:** Restore a passing, explicit contract for native JSON requests versus browser SSE.

**Files:**

- Modify: `mobile/src/lib/hermes-api.ts`
- Inspect/modify if required: `mobile/src/lib/native-http.ts`
- Test: `mobile/src/lib/__tests__/hermes-api.test.ts`

**Steps:**

1. Run from `mobile/`:

   ```bash
   npm run test:run -- src/lib/__tests__/hermes-api.test.ts
   ```

2. Record the exact failing assertion before editing.
3. Ensure JSON requests use the injected native implementation when available.
4. Ensure SSE explicitly sends `Accept: text/event-stream` and remains on browser `fetch`.
5. Ensure bearer/session headers are preserved on both paths without placing credentials in URLs or error messages.
6. Add regression coverage for:
   - native health/session/run requests;
   - browser SSE requests;
   - SSE response with no body;
   - non-2xx SSE response;
   - aborting an SSE reader;
   - parser completion and malformed events.
7. Run the focused test again, then the complete frontend suite.

**Acceptance criteria:** The focused Hermes API test and the complete frontend test suite pass, and the transport distinction is asserted by tests rather than inferred from implementation.

### Task 2: Prove selected-session identity through the complete send path

**Objective:** Prevent an existing session from silently routing a new message to an unintended session or default agent.

**Files:**

- Inspect/modify: `mobile/src/components/ChatView.tsx`
- Inspect/modify: `mobile/src/components/SessionDrawer.tsx`
- Inspect/modify: `mobile/src/app/App.tsx`
- Inspect/modify: `mobile/src/lib/session-store.ts`
- Inspect/modify: `mobile/src/lib/hermes-types.ts`
- Test: `mobile/src/components/__tests__/ChatView.test.tsx`
- Test: `mobile/src/components/__tests__/SessionDrawer.test.tsx`
- Test: relevant `mobile/src/app` tests

**Steps:**

1. Add a test that selects `session-1`, loads its history, sends a message, and verifies `startRun` receives exactly `sessionId: "session-1"`.
2. Add a test that changing sessions aborts the prior stream and prevents late events from mutating the newly selected session.
3. Add a test that a newly created session is the only session used by the first message after creation.
4. Verify that `App.tsx` does not retain a stale `sessionId` while replacing `initialMessages`.
5. Verify that the session list’s displayed ID/title is not being confused with an agent/model identifier.
6. Preserve any backend-provided session metadata needed to show the selected agent/model and avoid silently falling back to defaults.

**Acceptance criteria:** Tests demonstrate that the selected session ID is identical in the drawer, loaded history, run-creation payload, and active chat state.

### Task 3: Make run completion resilient to SSE failure

**Objective:** Avoid reporting `Failed to fetch` when Hermes accepted and continues processing a run.

**Files:**

- Modify: `mobile/src/lib/hermes-api.ts`
- Modify: `mobile/src/components/ChatView.tsx`
- Modify: `mobile/src/lib/run-state.ts`
- Add/modify: API types and fake-server fixtures as required
- Tests: Hermes API and ChatView test suites

**Steps:**

1. Determine from the existing Hermes API contract which authenticated endpoint can report run status or session history after a stream failure; do not invent a route.
2. Add a typed transport error that distinguishes:
   - run creation failure;
   - stream connection failure;
   - stream ended before terminal event;
   - run completion failure;
   - user cancellation.
3. After a stream failure following a successful run creation, perform bounded reconciliation using the confirmed API route.
4. If the run completed, render the result and mark the stream as recovered.
5. If the run is still active, show reconnecting/retrying state rather than a terminal failure.
6. If reconciliation cannot confirm the run, show an actionable diagnostic with the run ID but never credentials.
7. Add tests for each state transition.

**Acceptance criteria:** A dropped SSE connection cannot create a duplicate run, cannot lose the selected session ID, and does not immediately present a misleading hard failure.

### Task 4: Complete compact session navigation

**Objective:** Finish and validate the mobile session drawer without regressing selection or accessibility.

**Files:**

- Modify: `mobile/src/components/SessionDrawer.tsx`
- Modify: `mobile/src/components/__tests__/SessionDrawer.test.tsx`
- Modify: `mobile/src/styles.css`

**Steps:**

1. Keep the long list collapsed by default.
2. Ensure the current session title remains visible while the list is collapsed.
3. Ensure opening and closing the drawer does not scroll the chat transcript unexpectedly.
4. Add keyboard/accessibility assertions for `aria-expanded`, `aria-controls`, and selected-session state.
5. Add loading/error behavior tests for session selection.
6. Run the component test, full frontend tests, typecheck, lint, and Vite build.

**Acceptance criteria:** The drawer is compact, usable on a phone, and does not interfere with session identity or chat scrolling.

### Task 5: Run the complete alpha verification gate

**Objective:** Establish a clean, reproducible baseline before adding phone-control code.

**Commands:**

```bash
cd mobile
npm run test:run
npm run typecheck
npm run lint
npm run build
npx cap sync android
cd android
./gradlew clean testDebugUnitTest assembleDebug --rerun-tasks
```

**Additional checks:**

- `git diff --check`
- Verify no credentials appear in source, fixtures, logs, APK assets, or generated files.
- Inspect the compiled manifest and package metadata.
- Do not publish a new APK until this gate passes.
- Keep `.tmp/` and supplied attachment files out of Git.

**Acceptance criteria:** All frontend and Android checks pass, the working tree contains only intentional source changes, and the alpha baseline is suitable for installing on the test phone.

---

## Phase 2: Add the Android phone-control capability layer

### Task 6: Define the phone bridge contract before implementation

**Objective:** Create a small authenticated capability protocol independent of whether Hermes runs in Termux or inside the future managed runtime.

**Files:**

- Create: `docs/android-bridge-architecture.md`
- Create: `docs/android-bridge-protocol.md`
- Create: `termux-backend/android-bridge-plugin/README.md`
- Add protocol fixtures/tests under the existing frontend or backend test structure

**Protocol requirements:**

- Bind local services to `127.0.0.1` only.
- Authenticate every capability route, including health/status.
- Use a separate bridge token from the Hermes API credential.
- Store the bridge token with Android Keystore-backed storage.
- Apply request timeouts, body limits, response limits, and coordinate/text bounds.
- Never log screen trees, typed text, clipboard data, notification bodies, screenshots, or tokens by default.
- Return typed capability errors.
- Keep the initial bridge disabled until the user explicitly enables the required Android service.
- Do not expose arbitrary shell commands, arbitrary intents, or unrestricted automation.

**Initial capability contract:**

- `bridge.status`
- `accessibility.status`
- `screen.read`
- `node.find`
- `node.tap`
- `input.type`
- `system.back`
- `system.home`
- `screen.capture`

### Task 7: Implement the Android bridge health and permission state

**Objective:** Let the app report whether the phone-control service is available without exposing device data.

**Files:**

- Create: Android bridge plugin/service classes under `mobile/android/app/src/main/java/com/rickcain/hermesmobile/`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `mobile/src/app/App.tsx`
- Create: native bridge TypeScript adapter and tests

**Steps:**

1. Add only the accessibility service declaration required for the first vertical slice.
2. Add a Capacitor bridge method returning safe status metadata:
   - enabled/disabled;
   - service connected/disconnected;
   - supported Android API level;
   - available capability names.
3. Add an in-app setup screen linking to Android Accessibility settings.
4. Do not add location, SMS, contacts, phone, notification listener, overlay, or screen-recording permissions yet.
5. Add unit tests for status mapping and disabled-service behavior.
6. Inspect the compiled manifest to verify only the intended permissions are present.

### Task 8: Implement the accessibility read/tap/type vertical slice

**Objective:** Provide the first useful phone-control workflow with minimal permissions.

**Files:**

- Create/modify: Android AccessibilityService and bounded action executor
- Create/modify: native RPC adapter
- Modify: Termux bridge plugin/tool registry
- Tests: JVM protocol/action tests and fake-server integration tests

**Capabilities:**

- Read a bounded accessibility tree with:
  - node count limit;
  - depth limit;
  - password-field redaction;
  - text truncation;
  - optional bounds;
  - no raw sensitive logging.
- Find nodes by text/class/clickability.
- Tap by validated node ID.
- Type only into the currently focused input field with a length limit.
- Press back/home.

**Acceptance criteria:** Hermes can use the controlled tools through the existing Termux installation, while the APK remains incapable of arbitrary shell execution.

### Task 9: Add explicit screenshot and capability controls

**Objective:** Add visual feedback without silently granting high-risk permissions.

**Files:**

- Modify: Android bridge service and permission UI
- Modify: `mobile/src/app/App.tsx` and related components
- Add tests for permission-denied and cancellation paths

**Steps:**

1. Add explicit MediaProjection consent only when the user enables screenshot support.
2. Add screenshot size/quality limits.
3. Make screenshots user-visible in the app’s bridge activity/log state.
4. Add per-capability enable/disable state.
5. Add safe metadata-only audit breadcrumbs.
6. Verify secrets and screen content are absent from logs.

---

## Phase 3: Additional capabilities and adaptive runtime

### Task 10: Add lower-risk convenience capabilities

Prioritize:

- Wait for element
- Screen hash/diff
- Foreground app
- App launch with package validation
- Media controls
- Text-to-speech
- Clipboard with explicit user controls

Each capability requires its own permission review, typed contract, negative tests, and visible state.

### Task 11: Add notification and background status support

Only after the foreground bridge is reliable:

- Notification listener as a separate opt-in permission
- Notification redaction settings
- Foreground connection notification
- Reconnect handling
- No notification body persistence by default

### Task 12: Define the runtime adapter for future self-contained mode

Create an abstraction such as:

```text
HermesRuntimeAdapter
  ├── ExistingTermuxRuntime
  └── ManagedEmbeddedRuntime (future)
```

The adapter should expose only:

- detect;
- health;
- start;
- stop;
- restart;
- doctor;
- update;
- endpoint/credential handoff.

The phone bridge must remain independent of this adapter.

### Task 13: Prototype managed-runtime detection without bundling Hermes

Before adding a large runtime:

- Detect Termux package/install state.
- Detect the Hermes gateway endpoint.
- Detect whether the existing runtime is usable.
- Explain why the app chooses existing Termux or managed mode.
- Keep managed mode unavailable until its packaging, licensing, update, storage, and migration design are approved.

---

## Release gates

Do not publish a new APK for the phone-control work until all of the following pass:

```bash
npm run test:run
npm run typecheck
npm run lint
npm run build
npx cap sync android
cd android
./gradlew clean testDebugUnitTest assembleDebug --rerun-tasks
```

Also verify:

- compiled manifest permissions;
- package/version metadata;
- APK checksum;
- no embedded credentials;
- no unintended LAN bind;
- no arbitrary command route;
- pairing state survives restart;
- permission denial fails closed;
- bridge disconnect stops foreground/background work;
- `git diff --check` passes.

## Recommended immediate action

Start with Phase 1, Task 1: repair the Hermes API test failure and finish session/run/SSE reconciliation. Do not begin AccessibilityService implementation until the current alpha can reliably select a session, send to that exact session, receive the result, recover from a dropped stream, and pass the complete build gate.
