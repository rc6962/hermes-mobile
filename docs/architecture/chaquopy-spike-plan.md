# Chaquopy Spike & Embedded Hermes Implementation Plan

- **Status:** accepted (2026-08-16); supersedes Rust-clone plan; follows the 4-model review + dependency verification
- **Product:** Balls (com.epictechs.balls) — real Hermes embedded, Termux as advanced mode

## 1. Dependency verification (ground truth, not model claims)

Hermes core `project.dependencies` = **32 pinned packages**. Classification:

- **Pure Python (~24):** openai, certifi, python-dotenv, fire, httpx[socks], rich, tenacity, requests, jinja2, prompt_toolkit, croniter, packaging, Markdown, PyJWT[crypto], urllib3, pathspec, fastapi, python-multipart, ptyprocess, tzdata(win-only), uvicorn(base) → no Android issue.
- **Compiled with aarch64 wheels (~7):** pyyaml, ruamel.yaml, pydantic (Rust core), cryptography (Rust), psutil, websockets, Pillow → manylinux aarch64 wheels exist; Chaquopy supports these packages.
- **Droppable on Android (1):** **uvloop** (from `uvicorn[standard]`) — no Android support; install `uvicorn` base only (asyncio loop is fine for SSE streaming).
- **Skipped by markers (4):** tzdata, pywinpty, pywin32, concurrent-log-handler (win32-only).
- **Hermes-flagged Android exclusion (1):** nemo-relay — its dependency marker already excludes `'android' in platform_release`, i.e. upstream treats Android as first-class.

**Feasibility:** the entire core set already runs on the S24 Ultra in Termux (same ARM64/bionic/pip). The only spike-open question is Chaquopy wheel-repo coverage for exact pinned versions (pydantic 2.13.4, cryptography 50.0.0, Pillow 12.3.0, psutil 7.2.2, pyyaml 6.0.3, ruamel.yaml 0.18.17). Mitigation: pin to Chaquopy-supported versions.

Optional extras for v1: `[web]` (fastapi/uvicorn/starlette/multipart — already core), `[anthropic]`, `[google]`, `[youtube]`, `[acp]`, `[pty]` — all pure-Python. Voice/wake extras (faster-whisper, onnxruntime, sherpa-onnx, sentencepiece) are Podule-phase (v2+); onnxruntime and sherpa-onnx ship Android wheels, defer.

## 2. Spike (Phase 1) — milestones & gates

| M | Milestone | Gate |
|---|---|---|
| M1 | Chaquopy 16.x gradle plugin wired; empty CPython in APK builds for arm64 | APK builds; python version prints via JNI |
| M2 | `pip install hermes-agent[web]` with adjusted pins inside Chaquopy env | Import hermes_cli + fastapi app succeeds in app log |
| M3 | Embedded Hermes server starts on 127.0.0.1:8642 (foreground service), /health OK | `curl`/app health check returns authenticated OK |
| M4 | One session + one streaming run + stop via existing HermesApi path | Events flow; stop acks; no crash |
| M5 | Android-bridge plugin installed in embedded env; status read works | BridgeStatusCard shows embedded status |
| M6 | Metrics: APK delta, cold start, peak RSS (dumpsys meminfo) | **GO:** APK delta ≤80 MB, cold ≤6 s (target ≤4 s), RSS ≤300 MB · **NO-GO:** cold >8 s or RSS >350 MB or M3–M5 failure → re-evaluate (not a full pivot; escalate to owner) |

## 3. Implementation steps (files & commands)

1. **Gradle:** `mobile/android/build.gradle` (root) → `com.chaquo.python` plugin 16.x; `app/build.gradle` → `python { buildPython "python3.11" (or 3.12 per Hermes support), pip { install "-r", "python/requirements-android.txt" } }`, `ndk { abiFilters "arm64-v8a" }`.
2. **`mobile/android/app/src/main/python/`** — package `ballsruntime/` with `main.py`: loads Hermes API server (uvicorn, no uvloop), binds 127.0.0.1:8642, reads profile path + auth from app-private storage via Chaquopy `getFilesDir` passthrough.
3. **`requirements-android.txt`** — pinned set from §1 (uvicorn base; Chaquopy-supported pins).
4. **`RuntimeBridge.java`** (`com.epictechs.balls.runtime`) + Capacitor plugin `RuntimeBridgePlugin`: `start()`, `health()`, `status()`, `stop()`, `updateBundle()`, `setProviderKey()` — mirrors existing plugin patterns (SecureCredentials, TermuxLifecycle).
5. **`NativeHostService`** — foreground service (user-initiated start; `foregroundServiceType=dataSync` or `specialUse` per Play rules), holds the Chaquopy Python process.
6. **Keystore profile** — reuse `SecureCredentialsPlugin` (Keystore + AES-GCM already implemented); add per-provider key slots.
7. **RuntimeClient TS interface + TermuxRuntimeClient** (Phase 0, shared with both modes) — `mobile/src/lib/runtime/`.
8. **Update channel (Phase 3)** — signed manifest `{hermes_version, deps_lockfile_sha256, bundle_sha256, signing_key_id, pinned_until}`; wheelhouse downloaded to app-private `runtime/updates/`, signature verified, swap env dir, restart, health-check, rollback to prior env on failure. Play Store remains the base channel; in-app updates opt-in (4-model consensus).

## 4. Sequencing

1. Phase 0 RuntimeClient + Termux wrapper (1–2 d)
2. Attachments e2e (2–3 d) — independent
3. Spike M1–M6 (3–5 d)
4. Update/rollback channel (2–3 d)
5. Managed onboarding + Termux import path (2–3 d)
6. Play readiness (2–3 d, parallel from M3)

## 5. Risks (verified-updated)

1. **Chaquopy wheel coverage for exact pins** → adjust pins; Chaquopy 16.x converts manylinux wheels.
2. **uvloop absence** → uvicorn base; SSE streaming unaffected (asyncio loop).
3. **Cold start** → lazy import; warm at first foreground start.
4. **Play policy on embedded interpreter** → disclosures; foreground-only; data on-device.
5. **Update breakage** → signed manifest + rollback on health failure (4/4 consensus design).
