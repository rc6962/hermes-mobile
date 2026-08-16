# Managed Runtime — Multi-Model Execution Plan (Synthesis)

- **Status:** accepted direction (multi-model comparison 2026-08-16)
- **Models consulted:** GPT-5.6 Terra (thinking) · Kimi K3 (thinking) · GLM 5.2 (thinking) · Claude Sonnet 5 (thinking) — same brief, independent answers
- **Supersedes:** "Option B = embedded Python bundle" as the *primary* packaging path in `managed-runtime.md`. Option B remains only as a fallback if the native path fails its spike.

## Verdict (unanimous, 4/4 models)

**Embedded Python runtime is the wrong primary path. Use a Rust native core with a small JNI/FFI bridge behind a TS `RuntimeClient` interface.** Termux remains the advanced compatibility mode. All four models independently rejected Python-embedded and chose native Rust — the strongest possible triangulation for this decision.

Key numbers (consensus range):

| Metric | Terra | Kimi | GLM | Sonnet | Working target |
|---|---|---|---|---|---|
| Native core size | 4–8 MB | ~small/stripped | 2–6 MB | — | **2–8 MB** |
| APK delta | ≤12–20 MB | ≤60 MB (loose) | +2–6 MB | ≤+20% (unrealistic) | **≤15 MB** |
| Cold start (S24) | ≤2.5 s | ≤2.5 s | ≤4 s | ≤6 s | **≤3 s** |
| Peak memory | ≤180 MB | ≤150 MB | ≤120 MB | ≤180 MB | **≤150 MB** |
| Abort thresholds | — | >3 s / >80 MB / >180 MB | >6 s / >200 MB | — | **>6 s or >200 MB → abort & re-evaluate** |

## Synthesized architecture

```
React / Capacitor UI
        │
        ▼
RuntimeClient (TS interface)          mobile/src/lib/runtime/RuntimeClient.ts
        │
        ├── TermuxRuntimeClient        existing HermesApi over 127.0.0.1:8642 (compat mode)
        └── ManagedRuntimeClient       → RuntimeBridge (Capacitor plugin) → JNI → Rust core
                                                                              │
                                        loopback-only HTTP/SSE, signed versioned bundle,
                                        Keystore-backed encrypted profile (AES-GCM, device-bound)
```

### File plan (Phase 0 + spike, in order)

1. `mobile/src/lib/runtime/RuntimeClient.ts` — interface: `health`, `capabilities`, `models`, `sessions`, `startRun`, `stopRun`, `subscribeEvents`, `start`, `stop`.
2. `mobile/src/lib/runtime/termux-runtime-client.ts` — wraps existing `HermesApi` unchanged; strict regression tests.
3. `mobile/src/lib/runtime/runtime-manager.ts` — (GLM's contribution) selects active runtime, graceful fallback, foreground binding.
4. `native/cores/ballsnative/` — Rust core (`Cargo.toml`, `src/lib.rs`): minimal loopback HTTP server exposing `/health`, `/v1/runs`, SSE events, stop. Build via `cargo-ndk` for arm64-v8a + x86_64.
5. `mobile/android/.../runtime/RuntimeBridge.java` + Capacitor plugin — JNI entrypoints: `initialize(profile)`, `health()`, `startRun(configJson)`, `stopRun(runId)`, `streamEvents(runId)`.
6. Runtime bundle manifest `app/assets/runtime/RuntimeBundleSpec.json` — (GLM's contribution) `{name, version, hash, size, min_sdk, signing_key_id, pinned_until, rollback_map}`; verify signature before load; retain prior bundle until replacement passes health (rollback).
7. `mobile/android/.../security/CredentialsStore.kt` — Android Keystore + AES-GCM envelope; per-profile encrypted blob in app-private storage; never expose secrets to JS.
8. `mobile/android/.../runtime/NativeHostService.kt` — (Kimi's contribution) foreground service, user-initiated start, clean stop.
9. First-run managed setup flow — provider key entry → Keystore; offer import/migration from an existing Termux pairing (Kimi's migration helper); plain-language privacy copy.
10. Termux path — "Use an existing Termux installation" behind advanced mode (unchanged behavior).

### Spike (Phase 1) definition

Minimal e2e: `/health` OK → create one session → one authenticated streaming run (events flowing) → stop → clean shutdown. Measure on the S24 Ultra: APK delta, cold start, peak RSS (`dumpsys meminfo`).

- **GO:** health ≤2 s, cold start ≤3 s, memory ≤150 MB, all protocol steps pass, rollback works.
- **NO-GO:** cold start >6 s or memory >200 MB or any protocol step fails → re-evaluate native stack before any consumer work.

## Sequencing (next 6 work items)

| # | Item | Effort | Notes |
|---|---|---|---|
| 1 | RuntimeClient TS interface + Termux wrapper + tests | 1–2 d | Phase 0 gate: existing behavior unchanged |
| 2 | Attachments e2e (in-flight): adapter→runtime bridge + on-device send verification | 2–3 d | Terra #1 priority; independent of native work |
| 3 | Rust core skeleton + JNI bridge + Capacitor plugin | 4–5 d | arm64 + x86_64; loopback only |
| 4 | Spike: bundle, install, one streaming run + metrics on S24 | 2–3 d | GO/NO-GO gates above |
| 5 | Keystore profile + first-run managed onboarding (+Termux migration path) | 2–3 d | Only after spike passes |
| 6 | Play readiness: signing key, privacy policy, listing, content decl. | 2–3 d | Parallel from item 3 |

## Risks (top 5, consensus)

1. **ABI/toolchain maintenance** → pin toolchain, CI per-ABI, strict FFI surface.
2. **APK size / install overhead** → stripped Rust binary, ABI splits, lazy-load bundle.
3. **Key/credential security** → Keystore-only, AES-GCM envelope, rotation, redaction, short-lived tokens.
4. **Lifecycle/process death on Android** → foreground service + clean recovery; no background automation initially.
5. **Play policy/compliance** → data stays on-device, transparent disclosures, bundle signing, attestation where needed.

## Open decisions for Rick

- Rust core vs C++ (both viable; Rust chosen by 4/4 — confirm no in-house preference).
- Whether the initial consumer release requires managed mode (Play launch) or ships Termux-mode first with managed mode in a staged update.
- Provider model strategy for consumers (interim: user-supplied keys, provider-agnostic).
