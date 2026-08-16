# Balls — Engine Ownership Decision: Vendor Hermes vs Own Harness (Rust or Slim Python)

**Status:** PENDING OWNER LOCK — consult COMPLETE 2026-08-16, 4/4 convergence on B
**Owner:** Epic Technologies / Rick Cain
**Prepared by:** Hermes Agent (deepseek-v4-flash via opencode-go)
**Related:** `docs/balls-pricing-decision.md`, `docs/balls-local-models.md`, `docs/architecture/master-plan.md`

---

## Decision (to be locked)

> **B — Own slim Python harness.** Replace the vendored upstream Hermes engine with our own in-app Python agent harness — same loopback API contract the UI already speaks, reusing the proven Chaquopy embed + in-process llama.cpp hosting. Owned end-to-end: own roadmap, own defects, zero "Hermes" leakage, updates when we need them. Rust (C) is the documented fallback ONLY if Python cannot hold the ≤6 s cold-start / ≤80 MB APK gates (Terra's switch condition) — and even then Terra recommends a hybrid (Rust SSE shim + Python core), not a full rewrite.

---

## Why this is being revisited (requirement changed for real)

- **Earlier consult (2026-08-16):** a brief saying "Hermes-compatible runtime" produced 4/4 Rust votes (framing trap). Owner corrected the real requirement — "must actually run Hermes, full parity, updates with Hermes releases" — and the verdict inverted to vendoring the real runtime. That was correct at the time.
- **Now:** the owner accepts losing upstream parity. We use a small fraction of the surface (17 of the toolset catalog; none of the desktop TUI/dashboard/platform adapters/plugins/most skills), and want:
  - a product owned end-to-end (own roadmap, own codebase, own defects);
  - updates when WE need them, not on upstream's weekly cadence;
  - zero "Hermes" brand leakage into the consumer surface;
  - smaller/faster APK (gates: ≤80 MB APK, ≤6 s cold start, ≤300 MB RSS);
  - no weekly vendor ceremony (~40 sdists re-vendored + wheel cross-compile + branding re-apply + APK rebuild).

## Current state (the baseline being judged)

| Fact | Value |
|---|---|
| Engine | Upstream Hermes (Python, MIT), vendored wholesale via Chaquopy |
| Vendored tree | ~1.3 GB uncompressed: openai SDK 251 MB, optional-skills 130 MB, skills 113 MB, pygments 89 MB, plugins 85 MB, hermes_cli 68 MB, rich 66 MB, agent 45 MB, prompt_toolkit 36 MB |
| Boot | `balls_runtime.py` → Hermes APIServerAdapter on 127.0.0.1:8642 |
| API contract | /health, /v1/capabilities, /v1/runs + SSE, /api/sessions, approvals, stop |
| Enabled toolsets (17) | hermes-cli, web, search, vision, image_gen, terminal, skills, browser, cronjob, file, tts, todo, memory, session_search, clarify, code_execution, delegation |
| Disabled | computer_use, video, project, homeassistant, spotify, discord |
| Unused surface | desktop TUI/xterm, dashboard web UI, most platform adapters, most plugins, most bundled skills, desktop JSON-RPC |
| Update model | weekly vendor pass: engine + ~40 sdists → wheel cross-compile → `balls-ify-vendored.py` branding re-apply → APK rebuild → signed staged update |
| On-device model | llama.cpp in-process (ctypes, `libllama-server-impl.so`), Gemma 4 E2B Q4 3.11 GB / Qwen3 0.6B free tier |
| Cloud | self-hosted Qwen3-8B (Epic box), DeepSeek overflow fallback |
| APK artifact | **FULLY FUNCTIONAL embedded build EXISTS** — `mobile/.android-build/app/outputs/apk/debug/app-debug.apk`, **126 MB**, built 2026-08-16 17:18. 89 MB = Chaquopy `app.imy` (vendored Python), 4.8 MB libpython, 8.4 MB dex. NOTE: project overrides Gradle `buildDir` → real artifacts live under `mobile/.android-build/`, NOT `app/build/`. **Already 46 MB over the ≤80 MB gate — size creep is measurable TODAY, not hypothetical.** |
| Build-dir trap | Gradle `buildDir` override → inspect `mobile/.android-build/app/outputs/...`; the default `app/build/` holds a stale 4.3 MB Jul-26 debug APK with no Python payload (looks "missing" but isn't) |

## Options on the table

- **A — Keep vendoring Hermes** (status quo; optionally slim by stripping unused skills/plugins/toolsets + string patches, keep cadence).
- **B — Own slim Python harness**: own agent loop, tool dispatch, provider routing, sessions, memory, skills-as-data, SSE API server, device provisioning — reusing the proven Chaquopy embed + in-process llama.cpp (ctypes) + aiohttp.
- **C — Own Rust-native harness**: same feature list compiled native behind the same loopback API; no Python runtime. Smallest/fastest. Cost: full rewrite in Rust (HTTP/SSE, OpenAI-compatible client, tool sandbox, sessions store), llama.cpp + voice wiring under FFI, skills need a Rust-native execution story.

## Consult record — 4 thinking brains, identical brief (`.tmp/brief-own-harness.txt`)

| Brain | Verdict | Best idea | Weakest point |
|---|---|---|---|
| kimi-k3-thinking | **B** | 4-phase build (2/2/4/8 wk at our cadence); port-only-essential skills as data-driven plugins; entity scrub = lightweight | Assumes Hermes-style tool surface retained "to match" — v1 tool set should be cut to what we ship, not mirrored |
| gpt-5-6-terra-thinking | **B** | Switch condition: C only if Python can't hold 6 s/80 MB gates — and then a Rust SSE shim + Python core, not full rewrite; strict build gate with size budgets | Proposes PySide for minimal UI (irrelevant — UI is Capacitor/React, not Python) |
| glm-5-2-thinking | **B** | 6-week cadence; skills as JSON-descriptor plugin system; stable FFI boundary to llama C-ABI if C ever happens | Size estimate sloppy (50-120 MB → 150-250 MB "total" — mixes in model weights; our GGUF alone is 3.11 GB on-device, separate from APK) |
| claude-sonnet-5-thinking | **B** | Understand→Decide→Act core loop; port memory+session_search as core, skip desktop JSON-RPC; single-hop delegation with audit log | Most generic of the four; switch trigger circular ("when A costs more than B") |

**4/4 convergence on B — all four independent. Strong triangulation.**

## Adopt / Reject synthesis (from consult, 2026-08-16)

| Proposal | Source brain | Adopt? | Owner's reason |
|---|---|---|---|
| Own slim Python harness (B), reusing Chaquopy + in-process llama.cpp + aiohttp | all 4 | ADOPT (pending lock) | Owns the roadmap, kills vendor ceremony + brand leak, keeps proven integrations |
| Keep the exact existing API contract (/health, /v1/runs+SSE, /api/sessions, approvals, stop) | all 4 | ADOPT | UI doesn't change; RuntimeClient contract stays |
| Rust only as fallback if Python misses 6 s/80 MB gates — and even then as hybrid shim, not full rewrite | Terra | ADOPT as gate | Rewrite cost unjustified for our tool usage; measurable gate decides it |
| Port only essential skills as data-driven (JSON/markdown) plugins; SKIP the 113+130 MB skill tree | Kimi, Sonnet | ADOPT | We ship ~5 skills (finance/voice/code pods) — not 100 |
| Port memory + session_search as core in-process store | Sonnet | ADOPT | Memory is the product's moat (SplashTV-style customer knowledge) |
| Minimal delegation (single-hop + audit log), not multi-agent orchestration | Sonnet, Terra | ADOPT | v1 consumers don't need agent swarms |
| Browser tool → simplified HTTP fetch shim in v1; expand later | GLM, Sonnet | ADOPT | Consumer scope; deep browser is a future podule |
| Cron → in-process scheduler (Python `sched`), not full cron subsystem | Kimi, GLM | ADOPT | Voice callbacks + daily briefs only |
| Per-device provisioning + bearer loopback, no keys in APK | all 4 (inherited) | ADOPT | Already the security baseline |
| Entity scrub as lightweight single-e choke-point scrubber | Kimi | ADOPT | Voice transcripts + email are PII-heavy |
| Strict build gate: size budget, cold-start budget, per-release measurement | Terra | ADOPT | Prevents B's risk (size creep) from becoming real |
| PySide for "minimal UI surface" | Terra | REJECT | UI is Capacitor/React — Python has no UI role |
| "Match Hermes tool surface" (Kimi's framing) | Kimi | REJECT (refined) | We cut tools to what we ship, not mirror Hermes |

## Dissent record

| Brain | Recommendation | Overruled because | Valid points adopted |
|---|---|---|---|
| (prior consult) all 4 | Rust reimplementation of "Hermes-compatible runtime" | Framing trap — brief said "compatible with", owner meant "powered by Hermes, full parity, updates with Hermes". Verdict correctly inverted to vendoring at the time. | Framing discipline: briefs must encode the real requirement (now encoded: ownership accepted, parity not needed) |
| prior era: "vendor Hermes forever" (implicit status quo) | Keep upstream engine, patch branding weekly | Owner now accepts no-parity; vendor ceremony + leak + cadence are real recurring costs; upstream features we don't use still ship in the APK | Nothing — the vendor ceremony stays as the documented fallback (Option A) if B stalls |
| Terra (this consult) | "C if Python can't hold the gates" | Not overruled — ADOPTED as the gate itself, with the hybrid caveat | Gate + hybrid shim framing adopted as the safety valve |
| GLM (this consult) | 150-250 MB size estimate | REJECTED as stated — conflates APK with on-device model weights (3.11 GB GGUF is separate, downloaded at onboarding, never in APK) | "Model downloads separate from APK" rule re-confirmed |

## Owner lock

- [ ] Owner reviewed verdict table
- [ ] Decision locked: **A / B / C** (brains say B)
- [ ] Next steps propagated to `master-plan.md` + vendor scripts + docs (only after lock)

## If B locks — first actions (proposed, NOT started)

1. Cut toolset to shipping set (memory, session_search, web/search-lite, vision-lite, image_gen, file, tts/voice, cron-lite, approvals, delegation-lite, code_execution, clarify, todo) — drop the rest.
2. Stand up the new harness as `src/main/python/balls_engine/` alongside balls_runtime.py; keep the API contract byte-identical.
3. Port the 3 podule skills (Finance/Voice/Code) as JSON descriptors + markdown.
4. Add the build gate script (APK size / cold start / RSS measured every build).
5. Re-run the 80 MB / 6 s / 300 MB gates; if missed → evaluate Terra's hybrid (Rust SSE shim) before any full rewrite.