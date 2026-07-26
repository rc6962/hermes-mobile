# Hermes Mobile APK Frontend Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, with strict TDD and independent review after each implementation slice.

**Goal:** Build a lightweight Android chat frontend that communicates with Hermes Agent running in Termux, using Hermes' authenticated local API server rather than embedding the Python runtime or exposing the full Hermes dashboard.

**Architecture:** A React/TypeScript mobile UI will be packaged as an Android APK with Capacitor. Hermes remains the backend process inside Termux and exposes its API server on loopback. A small native Capacitor bridge will handle controlled Termux lifecycle intents; it will not be used as the chat transport. The first release will be chat/session focused. Android phone automation is a later, separately permissioned bridge.

**Tech Stack:** React and TypeScript, Vite, Vitest, React Testing Library, Capacitor Android, Kotlin/Gradle for the native bridge, Termux shell scripts, Hermes API server, GitHub Actions for APK builds.

---

## Current context

- Remote repository: `https://github.com/rc6962/hermes-mobile`
- Repository visibility: private
- Local checkout: `D:\Hermes\hermes-mobile`
- Current branch: `main`, clean and tracking `origin/main`
- Existing commit: repository scaffold and architecture notes only
- Existing scaffold directories: `mobile/`, `termux-backend/`, `docs/`
- The upstream Hermes web application is React/Vite/Tailwind and uses `@nous-research/ui`, themes, Markdown, and session-list components.
- The upstream full `ChatPage` is an xterm/TUI mirror using `/api/pty`; it must not be copied wholesale into the mobile client.
- Hermes' documented API server exposes `/health`, `/v1/capabilities`, `/v1/runs`, run SSE events, stop/approval endpoints, and session resources.
- API server defaults: `127.0.0.1:8642`; bearer authentication is controlled by `API_SERVER_KEY`.
- Browser clients require explicitly configured `API_SERVER_CORS_ORIGINS`; a Capacitor local origin is expected to be `http://localhost` and must be verified on-device.
- Host toolchain detected: Node `v24.16.0`, npm `11.13.0`, Java 17, ADB 37.0.0.
- No Android device is currently attached to ADB.
- `sdkmanager` and a standalone `gradle` command were not found during discovery; Android SDK/Gradle setup must be verified before APK compilation. The existing `ANDROID_HOME` points at the Scoop Android command-line-tools location and must be checked for required platform/build-tool packages.

## Explicit non-goals for the first milestone

- Do not embed Hermes' Python runtime in the APK.
- Do not port Hermes to Kotlin or Rust.
- Do not reproduce the full dashboard, admin panels, TUI, MCP management, cron UI, or skill editor.
- Do not implement AccessibilityService, Shizuku, root, notification automation, or unrestricted phone control in the first vertical slice.
- Do not expose the Hermes API server outside loopback.
- Do not commit provider credentials, Hermes API keys, APK signing keys, or local configuration.

## Decisions and guardrails

1. **Transport:** Use Hermes' documented API server and HTTP/SSE. Do not scrape terminal output and do not use `/api/pty` for chat.
2. **Termux commands:** Use `RUN_COMMAND` only for fixed lifecycle operations such as setup, start, stop, status, doctor, and update. Never pass arbitrary user-entered shell text through the bridge.
3. **Authentication:** Use a per-install bearer key. The key must be entered/generated locally and stored using Android secure storage; no key belongs in Git or APK source.
4. **Network scope:** Bind Hermes to `127.0.0.1`. Configure only the exact Capacitor origin for CORS. Do not use `*` for the release configuration.
5. **UI reuse:** Reuse published/shared Hermes visual components where practical, especially `@nous-research/ui`, themes, Markdown, and session patterns. Adapt transport/auth instead of importing dashboard-specific code.
6. **Testing:** Follow strict RED → GREEN → REFACTOR for production behavior. Every new API/parser/bridge behavior gets a test before implementation.
7. **Integration order:** Prove the API connection with a minimal client before investing in visual polish or device automation.
8. **Source synchronization:** Pin the upstream Hermes version/commit used for API and UI compatibility. Do not silently track upstream `main` in a release build.

---

## Phase 0 — Lock the development contract and environment

### Task 0.1: Record provisional Android identity and support policy

**Objective:** Choose values that can be used for the first debug APK while leaving release identity decisions explicit.

**Files:**
- Modify: `docs/architecture.md`
- Create: `docs/platform-support.md`

**Decisions to record:**

- Provisional application ID: `com.rickcain.hermesmobile` (change before the first public release if desired).
- Provisional minimum SDK: API 26 unless Capacitor/dependency testing requires a higher value.
- Target/compile SDK: the installed current stable Android SDK.
- Initial distribution: private/debug APK and GitHub Actions artifact; no Play Store work.
- Initial supported runtime: Android device with supported Termux installed.

**Verification:** Review the document and ensure no provider key, signing key, or device credential appears.

### Task 0.2: Establish build-tool diagnostics

**Objective:** Make missing Android tooling fail with an actionable message instead of a later Gradle error.

**Files:**
- Create: `scripts/check-environment.mjs`
- Create: `docs/development-environment.md`
- Modify: `README.md`

**Checks:** Node/npm, Java 17+, Android SDK root, `adb`, required SDK platform/build-tools, and Gradle wrapper availability.

**Tests/commands:**

```bash
node scripts/check-environment.mjs
node --version
npm --version
adb devices -l
```

Expected initially: Node/npm/Java/ADB detected; the script may report missing SDK packages or no attached device as warnings, not silently pass.

### Task 0.3: Add repository quality policies

**Objective:** Make secrets and generated Android output difficult to commit accidentally.

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `.env.example`
- Modify: `.gitignore`

**Content:** TDD rule, test commands, no-secrets rule, Termux setup safety, and the expected branch/commit workflow.

**Verification:** Run the repository secret scan and confirm `.env`, APKs, keystores, and local SDK files are ignored.

---

## Phase 1 — Validate Hermes and Termux manually before writing the APK bridge

### Task 1.1: Write the real-device setup checklist

**Objective:** Define the exact manual prerequisites needed to validate the backend on the phone.

**Files:**
- Create: `docs/termux-setup.md`

**Checklist:**

1. Install a supported Termux distribution.
2. Install/configure Hermes in Termux using the official Android/Termux path.
3. Configure a provider locally through Hermes setup/auth.
4. Enable the Hermes API server and set a locally generated API key.
5. Set `API_SERVER_CORS_ORIGINS=http://localhost` for the Capacitor browser origin during development.
6. Start `hermes gateway`.
7. Test `/health`, `/v1/capabilities`, and one `/v1/runs` request from Termux or a local client.

Never put a real API key in this document.

### Task 1.2: Add a reproducible backend contract fixture

**Objective:** Provide a fake local HTTP/SSE server so API client tests do not require a phone or live provider.

**Files:**
- Create: `mobile/tests/fixtures/fake-hermes-server.ts`
- Create: `mobile/tests/fixtures/sse-events.ts`
- Create: `docs/api-contract.md`

**Fixture behavior:** Health, capabilities, session creation/listing, run submission, split/chunked SSE response, approval request, stop, completed, failed, and cancelled runs.

**Verification:** The fixture must produce the same JSON/SSE shapes used by the client tests; live-device testing remains a separate acceptance layer.

---

## Phase 2 — Build the API client with strict TDD

### Task 2.1: Scaffold the TypeScript testable package

**Objective:** Create a minimal Vite/TypeScript/Vitest package without Android dependencies.

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/tsconfig.node.json`
- Create: `mobile/vite.config.ts`
- Create: `mobile/vitest.config.ts`
- Create: `mobile/index.html`
- Create: `mobile/src/main.tsx`

**Dependencies:** Align React/TypeScript/Vite versions with the current Hermes web workspace where practical; add Vitest, jsdom, Testing Library, and an HTTP mock/fixture strategy. Avoid importing the full dashboard dependency set.

**Verification:**

```bash
cd mobile
npm install
npm test -- --run
npm run typecheck
```

Expected: the empty suite runs successfully with no production UI yet.

### Task 2.2: Implement and test SSE parsing

**Objective:** Parse Hermes run SSE safely across arbitrary network chunk boundaries.

**Files:**
- Create: `mobile/src/lib/sse.ts`
- Create: `mobile/src/lib/__tests__/sse.test.ts`

**RED cases:**

- A JSON `data:` event split across two fetch chunks.
- Multiple events in one chunk.
- Keepalive comment lines beginning with `:`.
- Blank-line event delimiters.
- Malformed JSON.
- Stream completion and abort.

**Expected event names to support:**

```text
message.delta
tool.started
tool.completed
reasoning.available
approval.request
approval.responded
run.completed
run.failed
run.cancelled
```

**Verification:** Run the focused test before implementation and confirm RED; implement the smallest parser; rerun focused and full tests.

### Task 2.3: Implement the authenticated Hermes API client

**Objective:** Provide a small dependency-injected client that can be tested without a browser or Android device.

**Files:**
- Create: `mobile/src/lib/hermes-types.ts`
- Create: `mobile/src/lib/hermes-api.ts`
- Create: `mobile/src/lib/__tests__/hermes-api.test.ts`

**Client methods:**

```text
health()
capabilities()
listModels()
createSession()
listSessions()
getSessionMessages(sessionId)
startRun(input, sessionId)
subscribeToRun(runId, signal)
stopRun(runId)
respondToApproval(runId, choice, resolveAll)
```

**Contract details:**

- Send `Authorization: Bearer <API_SERVER_KEY>`.
- Preserve `X-Hermes-Session-Key` only when explicitly configured.
- `POST /v1/runs` must accept the selected session ID and user input and handle the documented `202 {run_id, status}` response.
- SSE must tolerate keepalives and terminal stream closure.
- Normalize API errors into a typed error containing HTTP status, server error code, and safe message.
- Never log the bearer key or include it in thrown error messages.

**Tests:** Authentication headers, 401 handling, 202 run creation, malformed responses, SSE accumulation, approval payloads (`once`, `session`, `always`, `deny`), stop response, and abort/reconnect behavior.

### Task 2.4: Add a reducer for run state

**Objective:** Turn unordered UI callbacks into deterministic chat state.

**Files:**
- Create: `mobile/src/lib/run-state.ts`
- Create: `mobile/src/lib/__tests__/run-state.test.ts`

**State behavior:** Append message deltas, track tool start/completion, expose pending approval, mark completed/failed/cancelled, preserve the final transcript, and ignore duplicate terminal events.

**Verification:** Focused RED/GREEN tests for every event transition, then full mobile test suite.

---

## Phase 3 — Create the minimal chat frontend

### Task 3.1: Create the app shell and backend connection state

**Objective:** Show a useful offline/connecting/online state before chat is attempted.

**Files:**
- Create: `mobile/src/App.tsx`
- Create: `mobile/src/app/app-state.ts`
- Create: `mobile/src/app/__tests__/app-state.test.ts`
- Create: `mobile/src/styles.css`

**UI:** Header/status indicator, first-run backend instructions, retry button, and a placeholder chat route.

### Task 3.2: Build the chat transcript and composer

**Objective:** Implement one complete user-to-streamed-assistant vertical slice.

**Files:**
- Create: `mobile/src/components/ChatView.tsx`
- Create: `mobile/src/components/MessageBubble.tsx`
- Create: `mobile/src/components/Composer.tsx`
- Create: `mobile/src/components/RunActivity.tsx`
- Create: `mobile/src/components/__tests__/ChatView.test.tsx`

**UI behavior:** Submit on send, disable duplicate submission, render streamed deltas, show tool cards collapsed by default, show stop while running, and preserve the final assistant message after completion.

**Tests:** User sends a prompt, stream updates the assistant message, stop calls the client, failure shows retry, and reconnect does not duplicate rendered text.

### Task 3.3: Add approval UI

**Objective:** Allow safe resolution of Hermes approval events without exposing terminal internals.

**Files:**
- Create: `mobile/src/components/ApprovalDialog.tsx`
- Create: `mobile/src/components/__tests__/ApprovalDialog.test.tsx`

**Behavior:** Show the redacted command/preview supplied by Hermes, offer only choices supported by the event, default to deny on dismissal, and call the typed API method. No arbitrary command editing.

### Task 3.4: Reuse selected Hermes web components

**Objective:** Apply Hermes visual language without importing the dashboard’s PTY/auth assumptions.

**Files:**
- Modify: `mobile/package.json`
- Create or adapt: `mobile/src/ui/`
- Create: `docs/upstream-ui-sync.md`
- Create: `UPSTREAM-NOTICES.md` if source files are vendored

**Reuse policy:**

- Prefer the published `@nous-research/ui` package for primitives.
- Reuse the upstream theme tokens and Markdown renderer where imports are self-contained.
- Adapt `ChatSessionList` patterns rather than importing dashboard `@/` aliases and management-profile logic.
- Do not import `ChatPage.tsx`, xterm, `/api/pty`, dashboard session-token injection, or dashboard WebSocket auth.
- Record the upstream Hermes commit/package version for every vendored component and retain required notices.

**Verification:** `npm run typecheck`, tests, lint, and a local browser preview showing the same chat flow as the component tests.

---

## Phase 4 — Add sessions and reconnect behavior

### Task 4.1: Implement session list/create/resume

**Objective:** Make the app a usable chat client rather than a single-run demo.

**Files:**
- Create: `mobile/src/components/SessionDrawer.tsx`
- Create: `mobile/src/lib/session-store.ts`
- Create: `mobile/src/lib/__tests__/session-store.test.ts`
- Modify: `mobile/src/lib/hermes-api.ts`

**Behavior:** Create a Hermes session, list sessions, load message history, resume a selected session, show server titles/message counts, and handle deleted/expired IDs.

### Task 4.2: Persist only local connection metadata securely

**Objective:** Preserve the backend URL and API key without placing secrets in browser local storage or source.

**Files:**
- Create: `mobile/src/lib/secure-config.ts`
- Create: `mobile/src/lib/__tests__/secure-config.test.ts`
- Later modify: native Capacitor bridge files

**Policy:** The web layer may request the native secure-storage bridge. For browser development, use an explicit `.env.local`/test stub that is never committed. Do not persist the real key in ordinary WebView localStorage in the release build.

### Task 4.3: Add reconnect and process-loss UX

**Objective:** Recover cleanly when Termux or the API server restarts.

**Files:**
- Modify: `mobile/src/lib/hermes-api.ts`
- Modify: `mobile/src/lib/run-state.ts`
- Modify: `mobile/src/components/ChatView.tsx`
- Create: `mobile/src/lib/__tests__/reconnect.test.ts`

**Behavior:** Exponential reconnect for the health check, bounded SSE reconnect, no duplicate deltas, visible offline state, and a safe way to refresh message history after a lost stream.

---

## Phase 5 — Package the frontend as an Android APK

### Task 5.1: Add Capacitor configuration

**Objective:** Package the tested web frontend without changing its API behavior.

**Files:**
- Create: `mobile/capacitor.config.ts`
- Modify: `mobile/package.json`
- Create/generated: `mobile/android/`

**Commands:**

```bash
cd mobile
npm run build
npx cap add android
npx cap sync android
```

Do not commit generated files until the Android build is reproducible and the package ID is confirmed.

### Task 5.2: Verify Capacitor localhost-to-loopback networking

**Objective:** Confirm the WebView can call Hermes at `127.0.0.1:8642` on a real device.

**Files:**
- Modify: `mobile/capacitor.config.ts`
- Create if required: `mobile/android/app/src/main/res/xml/network_security_config.xml`
- Modify if required: `mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `docs/termux-setup.md`

**Approach:** Use the Capacitor `http://localhost` origin and configure `API_SERVER_CORS_ORIGINS=http://localhost`. Permit only the minimum required local cleartext traffic. If Android WebView restrictions make this unreliable, add a native `HermesApiPlugin` proxy rather than weakening the server bind or using wildcard CORS.

**Acceptance test:** On the phone, health check succeeds, authenticated run succeeds, SSE stays open through a response, and no network request leaves the device.

### Task 5.3: Add the controlled Termux lifecycle bridge

**Objective:** Start and inspect the backend without making the user interact with Termux during normal use.

**Files:**
- Create: `mobile/android/app/src/main/java/com/rickcain/hermesmobile/TermuxBridgePlugin.kt`
- Create: `mobile/android/app/src/main/java/com/rickcain/hermesmobile/TermuxBridge.kt`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`
- Create: `mobile/android/app/src/test/.../TermuxBridgeTest.kt`
- Modify: `termux-backend/README.md`
- Create: `termux-backend/start-hermes.sh`
- Create: `termux-backend/stop-hermes.sh`
- Create: `termux-backend/status-hermes.sh`
- Create: `termux-backend/update-hermes.sh`
- Create: `termux-backend/doctor-hermes.sh`

**Intent requirements to verify against the Termux documentation during implementation:**

- Declare `com.termux.permission.RUN_COMMAND`.
- Add package visibility for `com.termux`.
- Send explicit `com.termux.app.RUN_COMMAND` intents.
- Use a fixed script path and allowlisted operation enum.
- Keep command arguments generated by the app, not arbitrary user input.
- Use API health polling for status; do not parse terminal output as the chat protocol.
- Provide a fallback setup screen when Termux is absent or external commands are disabled.

**Tests:** Intent action/extras, rejection of unknown operations, missing Termux handling, and safe error propagation. Device tests must verify the user-granted permission path.

### Task 5.4: Add first-run onboarding

**Objective:** Make the two-app dependency understandable to a normal user.

**Files:**
- Create: `mobile/src/pages/SetupPage.tsx`
- Create: `mobile/src/components/SetupChecklist.tsx`
- Modify: `mobile/src/App.tsx`
- Modify: `docs/termux-setup.md`

**Flow:** Detect Termux, explain the one-time permission, open Termux/settings when needed, accept or generate the API key locally, run health checks, and show a clear recovery path. Never claim setup succeeded until `/health` and `/v1/capabilities` pass.

---

## Phase 6 — Real-device integration and security hardening

### Task 6.1: Run the first vertical slice on the Galaxy S24 Ultra or emulator

**Objective:** Validate the architecture on Android rather than only in a desktop browser.

**Prerequisites:** User supplies a test device/emulator with USB debugging or wireless ADB enabled, supported Termux installed, Hermes installed, and a configured provider. The user enters credentials locally; credentials must not be sent in chat or committed.

**Commands:**

```bash
adb devices -l
cd mobile
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Acceptance checklist:**

- APK installs and launches.
- Termux detection is correct.
- `/health` and `/v1/capabilities` are authenticated.
- One prompt streams to completion.
- Tool progress is visible and collapsed.
- Approval can be denied and approved.
- Stop interrupts an active run.
- Termux restart produces an offline state and successful recovery.
- Session history survives APK restart.
- No API traffic goes to a non-loopback host.

### Task 6.2: Harden secrets and logging

**Objective:** Ensure API credentials do not leak through logs, intents, exceptions, screenshots, or GitHub artifacts.

**Files:**
- Modify: `mobile/src/lib/secure-config.ts`
- Modify: `mobile/android/app/src/main/java/com/rickcain/hermesmobile/TermuxBridge.kt`
- Create: `docs/security-model.md`
- Create: `mobile/src/lib/__tests__/redaction.test.ts`

**Checks:** No bearer key in console logs, URL query strings, crash messages, Termux command arguments, test snapshots, or CI logs. Redact approval previews only as Hermes supplies them; do not reintroduce raw command text.

### Task 6.3: Add local integration test mode

**Objective:** Let CI test the APK’s web client against a deterministic fake Hermes server.

**Files:**
- Modify: `mobile/tests/fixtures/fake-hermes-server.ts`
- Create: `mobile/tests/integration/chat-flow.test.ts`
- Modify: `mobile/package.json`

**Verification:** CI can run the complete chat/session/approval/stop flow without a provider or Android device; real-device tests remain a manual or separately triggered job.

---

## Phase 7 — Updates and reproducible GitHub builds

### Task 7.1: Add debug APK GitHub Actions build

**Objective:** Produce a downloadable debug APK on every main-branch build after the Android project is stable.

**Files:**
- Create: `.github/workflows/android.yml`
- Create or commit: `mobile/android/gradlew` and Gradle wrapper files
- Modify: `README.md`

**Workflow:** Checkout, setup Node, install npm dependencies, build web assets, run Capacitor sync, setup Java 17 and Android SDK, run Gradle tests/build, upload debug APK artifact. No signing secret is required for debug builds.

**Verification:** Run the workflow on a branch, inspect logs, download the APK artifact, and install it with ADB.

### Task 7.2: Add backend update helper

**Objective:** Let the APK request a safe Hermes backend update through Termux.

**Files:**
- Modify: `termux-backend/update-hermes.sh`
- Create: `mobile/src/components/BackendUpdateCard.tsx`
- Create: `mobile/src/lib/__tests__/backend-update.test.ts`
- Modify: `docs/termux-setup.md`

**Behavior:** Invoke only `hermes update`, report that the backend may restart, poll `/health` after completion, and display failure output without exposing secrets. Do not have the APK download or modify Python packages directly.

### Task 7.3: Document release signing without enabling it prematurely

**Objective:** Prevent future APK updates from being made impossible by losing the signing key.

**Files:**
- Create: `docs/releasing.md`
- Create: `.github/workflows/release.yml` only when requested

**Policy:** Choose and securely back up one Android signing identity before publishing release APKs. Store signing material only in GitHub encrypted secrets or an external secure process. Never commit it.

---

## Phase 8 — Optional Android automation bridge (after chat MVP)

### Task 8.1: Define the native device-tool contract

**Objective:** Keep phone automation separate from the chat transport and least-privileged by default.

**Files:**
- Create: `docs/device-bridge.md`
- Create: `docs/threat-model.md`

**Potential later tools:** `open_app`, `read_screen`, `tap`, `swipe`, `type_text`, `press_back`, `take_screenshot`, `read_notifications`, and `launch_intent`.

**Guardrails:** Explicit permission screen, per-action approval for sensitive operations, global kill switch, local action log, authenticated loopback bridge, and no claims of unrestricted device control.

### Task 8.2: Add native permissions only when one tool has a testable use case

**Objective:** Avoid adding AccessibilityService/MediaProjection/Shizuku complexity before the chat client is dependable.

**Rule:** Each permission gets one vertical slice: failing integration test, native implementation, permission-denied behavior, user-visible explanation, and real-device verification.

---

## Parallel implementation and review strategy

After Phase 1 and the API contract are fixed, work can be split without overlapping files:

- **Agent A — API client:** `mobile/src/lib/`, API fixtures, and API tests.
- **Agent B — web/mobile UI:** `mobile/src/components/`, pages, styles, and UI tests.
- **Agent C — Termux/Android bridge:** `termux-backend/`, Capacitor configuration, native intent bridge, and Android tests.

The parent session owns integration and release files. Each agent must:

1. Follow strict TDD.
2. Work only in its assigned paths.
3. Run focused tests, then the full suite.
4. Return exact files changed and command output.
5. Avoid credentials and external destructive actions.

After each slice, run:

- Static secret scan.
- Typecheck/lint/tests.
- Independent spec-compliance review.
- Independent code-quality/security review.
- Only then commit/push.

Use short commits such as:

```text
[verified] feat: add Hermes SSE client
[verified] feat: render streamed mobile chat
[verified] feat: add controlled Termux lifecycle bridge
```

---

## Required verification commands once implementation begins

From `D:\Hermes\hermes-mobile`:

```bash
cd mobile
npm ci
npm run typecheck
npm test -- --run
npm run lint
npm run build
```

After Android scaffolding exists:

```bash
npx cap sync android
cd android
./gradlew test
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Before every push:

```bash
git status --short
git diff --check
git diff --cached
```

No task is complete merely because files were written; the relevant test, build, or device acceptance check must have real output.

---

## What is needed from Rick to proceed

No provider credential or API key needs to be sent to Hermes or committed to GitHub. The minimum practical prerequisites are:

1. **Android test target:** Connect the updated Galaxy S24 Ultra by USB/wireless ADB or provide an emulator. `adb devices -l` currently shows no attached device.
2. **Termux backend:** Install a supported Termux build on that device and install/configure Hermes locally with at least one working provider.
3. **Package identity:** Confirm whether to keep provisional `com.rickcain.hermesmobile` or choose another Android application ID before the first installable APK.
4. **Minimum Android version:** Accept provisional API 26 or choose a different floor after checking the devices that must be supported.
5. **Branding:** App display name/icon can remain provisional as `Hermes Mobile` for the first debug build.

The repository, private GitHub remote, implementation direction, and first milestone are already established. The only blocker to real-device validation is access to a configured Android/Termux test environment; desktop API client work can begin without it.

## Definition of done for the first release candidate

A release candidate is not complete until a real Android device can install the APK, start or reconnect to Hermes in Termux, stream a response, display tool/approval state, stop a run, resume a session after restart, and pass the secret/network checks above.
