# Managed Runtime Architecture Roadmap

- **Status:** proposed architecture; implementation begins only after the feasibility spike passes.
- **Date:** 2026-08-02
- **Product decision:** The managed/self-contained runtime is the normal customer experience. Existing Termux is an advanced/development compatibility mode.

## Goal

Ship one Epic Technologies Android application that can run a local Hermes-compatible agent runtime without requiring the user to install, understand, or configure Termux.

The same UI must also support an existing Termux Hermes installation for advanced users, development, migration, and recovery.

## What this is not

- Not a promise to package the present Termux environment wholesale inside the APK.
- Not arbitrary device automation or hidden shell execution.
- Not a reason to delay chat UX, session, streaming, approval, stop, or activity-status work.
- Not a public-release decision, package-ID decision, or provider-resale decision.

## Existing foundation

The current frontend already communicates through authenticated JSON and SSE endpoints:

```text
/health
/v1/capabilities
/v1/models
/v1/runs
/v1/runs/{runId}/events
/v1/runs/{runId}/stop
/v1/runs/{runId}/approval
/api/sessions
```

That is the correct product boundary. The UI should not need to know whether those endpoints are served by Termux or by a managed runtime inside the app.

## Target architecture

```text
React / Capacitor UI
        │
        ▼
RuntimeClient interface
        │
        ├── ManagedRuntimeClient          default consumer mode
        │      │
        │      ▼
        │   Native Android runtime host
        │      ├── lifecycle and health
        │      ├── encrypted credential/profile storage
        │      ├── local-only API transport
        │      └── Hermes-compatible agent runtime bundle
        │
        └── TermuxRuntimeClient           advanced compatibility mode
               │
               ▼
            Existing authenticated Termux Hermes API
```

### Required RuntimeClient contract

Both runtime modes must expose equivalent behavior for:

- readiness and health;
- capability discovery;
- model discovery;
- session create/list/read;
- run start, event stream, stop, and approval response;
- bounded lifecycle status;
- structured setup state and recoverable errors.

The existing `HermesApi` TypeScript client should become the shared protocol client or be wrapped by `RuntimeClient`; UI components must not import a Termux-specific implementation.

## Managed runtime host responsibilities

The native Android layer owns:

1. **Runtime installation** — validate a signed/versioned runtime bundle before first use.
2. **Profile storage** — store runtime profile data in app-private storage, never shared external storage by default.
3. **Credential storage** — use Android Keystore-backed encrypted storage; never render or log credentials after entry.
4. **Lifecycle** — start only from a clear user action or supported app lifecycle event, expose status, and stop cleanly.
5. **Local transport** — bind only to loopback or use a native bridge; no public LAN listener by default.
6. **Health and recovery** — provide doctor-style checks with safe repair/retry options.
7. **Update/rollback** — retain the prior validated bundle until the replacement has launched and passed health verification.
8. **Observability** — expose safe, redacted phases such as starting, ready, updating, unavailable, and recovery-required.

## Background execution constraint

The managed runtime cannot assume an unrestricted permanent Android process. Android foreground-service starts and service types have platform restrictions, and Android 15+ adds time limits for some foreground-service categories. The initial managed runtime should therefore prioritize **foreground, user-initiated chat execution** and clean recovery after process death. Persistent/background automation is a later, separately-designed capability.

Sources checked 2026-08-02:

- [Android foreground service changes](https://developer.android.com/develop/background-work/services/fgs/changes)
- [Android foreground-service background-start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Android foreground-service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)

## Runtime packaging options

### Option A — Native/compiled Hermes-compatible core

Package a purpose-built native or JVM-compatible runtime behind the local protocol.

- **Strengths:** strongest Android lifecycle integration; smaller attack surface once mature.
- **Costs:** highest engineering effort; requires implementing/maintaining compatibility with the Hermes API and tool/runtime behavior.
- **Use:** long-term option only after the protocol contract is stable.

### Option B — Managed embedded runtime bundle

Bundle a supported language/runtime distribution and Hermes-compatible server in app-private storage, controlled by the Android host.

- **Strengths:** fastest route to preserving existing agent behavior.
- **Costs:** native dependencies, APK/app-bundle size, startup time, update integrity, licensing, and Android process behavior must be proven.
- **Use:** preferred feasibility-spike candidate because it minimizes semantic rewrite risk.

### Option C — Termux-only integration

Keep the current external-runtime architecture as the only mode.

- **Strengths:** already operational for technical users.
- **Costs:** unsuitable as the default consumer/Play Store experience; external installation, permissions, and support burden remain.
- **Use:** retain only as advanced compatibility mode.

### Recommended path

Start with **Option B as a measured feasibility spike**, while preserving the option to graduate selected components to Option A later. Do not commit to shipping a large embedded bundle until the spike proves cold start, secure storage, health, session persistence, streaming, and update recovery on the S24 Ultra.

## Staged roadmap

### Phase 0 — Runtime-neutral frontend boundary

**Outcome:** Current app works unchanged through an explicit runtime selection/client abstraction.

1. Define `RuntimeClient` and setup-state types in `mobile/src/lib/`.
2. Wrap existing `HermesApi` as `TermuxRuntimeClient` without changing its HTTP/SSE behavior.
3. Make `App.tsx`, pairing, lifecycle, and chat depend on `RuntimeClient` instead of Termux assumptions.
4. Add fixtures proving both clients can satisfy the same chat/session/run contract.

**Gate:** Existing Termux-backed frontend, tests, APK installation, and S24 smoke behavior remain unchanged.

### Phase 1 — Managed runtime feasibility spike

**Outcome:** A development-only native host can start a minimal bundled runtime and complete one local, authenticated streaming run.

1. Build a throwaway Android-hosted runtime proof of concept in a separate module/branch.
2. Measure APK size, cold start, warm start, memory, battery effect, and restart recovery on the S24 Ultra.
3. Prove `/health`, one session, one bounded run, SSE events, stop, and clean shutdown.
4. Validate the credentials/profile path is app-private and redacted in logs.
5. Document every native dependency and license before carrying it forward.

**Gate:** Do not merge into the product path unless all protocol checks pass and device resource behavior is acceptable.

### Phase 2 — Managed profile, credentials, and lifecycle

**Outcome:** Managed mode can initialize, securely retain a profile, and recover from normal restarts.

1. Add versioned runtime manifest and integrity verification.
2. Add Keystore-backed credential/profile store with explicit export/delete behavior.
3. Implement runtime install, start, health, stop, doctor, and rollback state machine.
4. Implement native-to-WebView status events with no secrets or raw command payloads.
5. Add corruption, interrupted update, process death, and denied-credential tests.

**Gate:** Repeated install/start/stop/update-recovery cycles succeed on the S24 without Termux.

### Phase 3 — Consumer onboarding and optional Termux path

**Outcome:** New users see managed mode first; advanced users can choose existing Termux.

1. Build the setup wizard around explicit runtime choices.
2. Default to managed runtime with plain-language local/privacy explanations.
3. Put Termux setup behind `Use an existing Hermes installation` / advanced mode.
4. Verify every external Android settings step on return to the app.
5. Provide a clear repair/reset path for each mode.

**Gate:** A new tester can complete managed onboarding without knowing Termux exists; a technical tester can still connect an existing Termux runtime.

### Phase 4 — Compatibility, migration, and hardening

**Outcome:** Users can move between modes without losing control of data or credentials.

1. Define supported data migration/export/import rules.
2. Keep runtime identities distinct; do not silently copy secrets between modes.
3. Add schema/version migration tests.
4. Add offline, device reboot, low-storage, killed-process, failed-update, and no-network scenarios.
5. Add privacy disclosure, diagnostics redaction, and user-visible data deletion flows.

**Gate:** Migration and recovery are reproducible, documented, and independently tested.

### Phase 5 — Release readiness

**Outcome:** A release candidate meets security, policy, and support requirements.

1. Complete legal/licensing review for all bundled components and model/provider flows.
2. Confirm distribution policy implications with current Play Console guidance before release.
3. Finalize branding, package ID, signing, privacy policy, support, and crash reporting.
4. Produce a clean-device install/onboarding test matrix and release checklist.
5. Validate app-bundle size, startup, battery, update, rollback, and support diagnostics.

**Gate:** No public release until the full acceptance matrix, policy review, and physical-device gates pass.

## Security and privacy rules

- Bind managed APIs locally only; do not use a public listener by default.
- Treat all runtime credentials as sensitive; redact them from UI, logs, screenshots, diagnostics, and exports.
- Do not let ordinary chat content become unvalidated native commands.
- Maintain explicit user approval for privileged Android capabilities.
- Keep Accessibility disabled by default and separate from runtime startup.
- Use signed/versioned runtime bundles with rollback rather than arbitrary downloaded executable content.
- Preserve existing fixed lifecycle allowlists for the optional Termux adapter.

## Immediate implementation order

1. Create `RuntimeClient` types and a Termux adapter with strict regression coverage.
2. Refactor the UI composition root to select a runtime client without changing chat behavior.
3. Run all current frontend/Android/S24 gates.
4. Build the managed-runtime feasibility spike separately from the production application path.
5. Only after the spike passes, implement managed onboarding and persistence.

## Open questions requiring later decisions

- Which runtime packaging approach passes the feasibility spike most cleanly?
- What model-provider configuration is appropriate for consumer-managed mode versus a user-supplied provider? **Interim decision:** keep the initial product provider-agnostic like Hermes, allowing users to add/change providers and models; revisit optional Epic-managed models during monetization planning.
- What data is portable between managed and Termux profiles?
- What update channel, signing, and rollback model will be used?
- Which optional Android capability features belong in the first public release?
- What are the final name, domain, package ID, legal entity, and Play Store business model?
