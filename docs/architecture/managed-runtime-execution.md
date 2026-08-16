# Managed Runtime — Execution Plan (Revised)

- **Status:** accepted direction (revised 2026-08-16 after product clarification)
- **Product requirement (Rick):** the managed mode must be **powered by real Hermes** — all Hermes features, agents, tools, phone-system bridge access, and updateable whenever new Hermes agents ship. It is Hermes, called Balls, self-contained for everyday users.

## Verdict (revised)

**Embed the real Hermes runtime inside the app via Chaquopy (embedded Python for Android).** Not a Rust reimplementation.

The earlier 4-model comparison (Terra · Kimi · GLM · Sonnet) answered a different question — "Hermes-*compatible* runtime" — and correctly chose Rust for a from-scratch partial clone. A clone cannot satisfy the actual product requirement: full parity with Hermes and continuous updates as new Hermes agents ship. A reimplementation is a permanent catch-up treadmill; embedding the real runtime is the only path to parity + updateability.

## Architecture

```
React / Capacitor UI (Balls)
        │
        ▼
RuntimeClient (TS)                 mobile/src/lib/runtime/RuntimeClient.ts
        ├── TermuxRuntimeClient     existing Hermes in Termux (advanced mode)
        └── ManagedRuntimeClient    → Capacitor RuntimeBridge → Chaquopy-embedded Python:
                                        real Hermes agent runtime + plugins
                                        (incl. bounded Android-bridge plugin for phone access)
                                        loopback-only HTTP/SSE, Keystore-encrypted profile
```

- **Embedding:** Chaquopy bundles CPython + Hermes + locked dependencies inside the APK/AAB.
- **Update channel:** signed manifest (`hermes version`, dependency lockfile, sha256, signing key, pinned_until) → download wheels to app-private storage → verify signature/hash → swap environment → keep prior env for rollback. Same staged update rules as `managed-runtime.md` Phase 2.
- **Credentials:** Android Keystore + AES-GCM envelope; provider keys never exposed to JS.
- **Phone access:** the existing bounded Android-bridge plugin (status/settings; Accessibility opt-in) installs into the embedded Hermes environment — same protocol and safety rules as Termux mode.
- **Licensing:** Hermes is MIT — commercial embedding permitted (verified earlier).
- **Sizes/targets:** APK delta ~40–80 MB (Play AAB limit 200 MB); cold start ≤6 s first run (target ≤4 s); warm ≤2 s; peak memory ≤300 MB on S24.

## Sequencing (next 6 work items)

| # | Item | Effort |
|---|---|---|
| 1 | RuntimeClient TS interface + Termux wrapper + tests (Phase 0) | 1–2 d |
| 2 | Attachments e2e: adapter→Hermes bridge + on-device send verification | 2–3 d |
| 3 | Chaquopy spike: embedded real Hermes in APK; /health, one streaming run, stop, bridge status on S24 | 3–5 d |
| 4 | Update/rollback channel: signed manifest + wheel swap + rollback test | 2–3 d |
| 5 | Keystore profile + first-run managed onboarding (Termux import path) | 2–3 d |
| 6 | Play readiness: signing, privacy, listing, content declarations | 2–3 d (parallel from 3) |

## Risks (top 5)

1. **APK size / install time** → AAB splits (arm64-only initially), strip debug artifacts, keep deps locked tight.
2. **Cold start latency** → lazy-load heavy modules, warm the env at first launch, cache imported Hermes state.
3. **Update breakage** → signed manifests, dependency pinning, rollback on any health failure after swap.
4. **Play policy on embedded runtimes** → transparent disclosures; data stays on-device; no background automation initially (foreground/user-initiated only).
5. **Android-bridge parity between modes** → same plugin + protocol in both; regression test both paths.

## Podule naming (corrected 2026-08-16)

An earlier agent misconstrued the name "Phone Podule". Authoritative mapping:

- **Phone Podule** = the ability to **make calls** — telephony podule: dialer, call handling, voicemail, the phone bridge. Owned by the voice system (see `D:\Hermes\direct-sip-agent\docs\AGENT-COMMS.md` — tenant auth, app dashboard, token handshake).
- **Local Podule** = on-device model (Gemma 4 E2B 4-bit, llama.cpp in-process — `balls-local-models.md`) — the offline/privacy chat tier. NOT a call feature.
- **Cloud Podule** = Epic's VPS inference (epic proxy → local llama.cpp, no-logging contract).

## Runtime kinds (product)

| Kind | What runs the agent | Status |
|---|---|---|
| `termux` | Existing Hermes in Termux (advanced mode) | ✅ shipping today |
| `managed` | Embedded Hermes (Chaquopy) — the self-contained product | 🔄 M3/M4 (spike) |
| `remote` (self-hosted) | Hermes gateway on the user's own server (VPS/home) or Epic's cloud (Cloud Podule) | 📝 planned — reuses RuntimeClient/HermesApi; requires transport-policy opt-in for non-loopback URLs + Keystore key slot (new alias) |
| `local` (Local Podule) | Embedded Hermes + **on-device llama.cpp** (Gemma 4 E2B 4-bit default; Qwen3 1.7B tool alt; Qwen3 0.6B/SmolLM fallback) — fully offline | ✅ spiked 2026-08-16 (`balls-local-models.md`): `managed` + vendored `llama-server` subprocess provider in `provider_json` (no ctypes, no llama-cpp-python); GGUF downloaded at onboarding |

Self-hosted/cloud mode: user-entered base URL (http/https, validated) + API key stored in Android Keystore; explicit confirmation that traffic leaves the device; TLS recommended. Phone-local mode: models download at onboarding (GGUF ~0.3–1.5GB), persona preloaded in KV cache, hybrid routing (local default, cloud opt-in per `balls-serving-privacy-decision.md`).

## Update flow (concrete, accepted 2026-08-16)

The abstract W4 design is now concretized by the in-repo wheel store:

```
Hermes release (PyPI/GitHub) → OUR REPO (pin → rebuild → verify → sign) → Balls app
```

1. **Weekly check** (cron: Hermes update check, Mon 09:00): PyPI hermes-agent version
   vs the vendored baseline; GitHub release deltas. Report = action item or no-op.
2. **Processing pass** (on action item): mirror new hermes-agent source into
   src/main/python/; re-pin requirements-android.txt from the new pyproject.toml;
   rebuild changed Rust wheels (maturin pipeline: jiter, pydantic-core — see
   android/scripts/build-android-wheels.sh); re-verify the documented Android
   exclusions (pyyaml/ruamel.yaml/markupsafe/jinja2/openai = vendored pure-Python;
   cryptography/psutil/Pillow = excluded as optional); sign manifest (versions +
   sha256) with pinned_until.
3. **Distribution**: default = new app build via Play; opt-in = signed in-app
   runtime swap with health check + rollback to the previous signed bundle.
4. **Ownership**: the repo is the gatekeeper — upstream can never break a phone;
   the frontend (RuntimeClient seam) never changes across runtime updates.

## Superseded

The Rust-native plan in the earlier version of this file is withdrawn as the primary path. It may return later as a micro-optimization for the protocol surface only if measurements demand it.

## Dissent recorded (Terra, 2026-08-16)

Consulting Terra on the revised direction produced a dissent: Terra recommends a native Rust core over Chaquopy embedding, citing wheel brittleness, APK bloat, and background limits. The dissent was evaluated and overruled on requirement grounds: a native core cannot deliver full Hermes parity + continuous updates (the owner's explicit requirement); it is a permanent reimplementation treadmill. The only self-contained path that runs *real* Hermes is embedding it. Feasibility evidence favoring Chaquopy: Hermes already runs on the S24 Ultra today via Termux (same ARM64/bionic/pip environment). Terra's valid points were adopted instead: hybrid update channel (Play default + opt-in signed in-app Hermes updates with rollback), arm64-first ABI splits, foreground-only execution, thin IPC surface.

## Full 4-model review of the Chaquopy revision (2026-08-16)

Same revised brief, all `-thinking` variants:

- **Kimi K3 — supports the revision.** Parity + continuous updates require shipping real Hermes; a Rust reimplementation cannot match runtime compatibility, plugins, and wheel-based upgrades. Adds: signed in-app Hermes updates for v1 (faster than Play cadence), version-pinned environment, foreground service.
- **Terra — opposes.** Native Rust core preferred; embedding is brittle. (See dissent above.)
- **GLM 5.2 — opposes.** Cites dependency brittleness and APK churn; recommends a clean-room native core behind a stable IPC. Same treadmill objection applies.
- **Claude Sonnet 5 — conditional.** "Not clearly right" but acceptable *if* robust update/rollback and size management are committed; otherwise prefers Rust.

Pattern: all three dissenters optimize engineering cleanliness and each recommends the Rust clone, which cannot meet the owner's parity/update requirement; only Kimi re-derived the answer from the requirement itself. 

**Adopted from the review:** 4/4 consensus on hybrid updates (Play for the app shell; signed in-app Hermes wheel swaps with rollback for agents); Kimi's v1 signed in-app update preference; version-pinned embedded environment; feature flags for staged Hermes capability rollout.

## Open decisions for Rick

- Arm64-only first release vs. full ABI coverage (size vs. device reach).
- Update delivery: in-app signed update downloads vs. Play-only releases (play-only is simpler for v1).
- Whether managed mode ships in the same version as the Termux mode or gates on the spike result.

