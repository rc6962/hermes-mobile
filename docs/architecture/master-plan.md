# Balls — Master Completion Plan (Terra, 2026-08-16)

- **Source:** GPT-5.6 Terra (thinking), synthesized from full project state
- **Note on estimates:** Terra's numbers assume a conventional 1–2 engineer team with enterprise cadence. Our actual velocity on this project (autonomous agent + owner testing on the S24) has been ~10–20× faster for equivalent scope; treat Terra's weeks as conservative upper bounds, use the work breakdown and ordering as authoritative.

## Work breakdown (dependency-ordered)

| ID | Item | Terra effort | Done = |
|---|---|---|---|
| W1 | Phase 0: RuntimeClient TS interface + TermuxRuntimeClient wrapper + tests | 4–6 wk* | All Phase 0 tests pass; Termux path unchanged; APK verified |
| W2 | Attachments e2e: adapter bridge wiring, on-device sends, PDF/DOCX extraction, honest .doc | 6–8 wk* | e2e suite green; on-device image/document sends verified; extraction verified |
| W3 | Chaquopy spike M1–M6: embedded real Hermes | 8–12 wk* | APK ≤80 MB, cold ≤6 s, RSS ≤300 MB; wheel swap + rollback validated |
| W4 | Update/rollback channel: signed manifest, wheel swap | 3–5 wk* | Staged update + rollback verified; no downgrade risk |
| W5 | Keystore profile + first-run managed onboarding + Termux import | 3–5 wk* | First-run completes error-free; secure storage verified |
| W6 | Bounded Accessibility read-only phase | 2–3 wk* | RC suite passes; read-only enforced |
| W7 | Release signing + Play readiness (privacy, listing, screenshots, content declarations) | 2–4 wk* | Submission-ready AAB + compliance pack |
| W8 | Podules monetization design (Finance/Voice/Code) | 2–4 wk* | Design approved; integration plan ready |
| W9 | Domain/trademark deferred actions (balls.ai/.app, ITU filing 9+42) | 1–3 wk* | Legal actions in motion |
| W10 | Managed runtime phases 2–5 (migration, hardening, release) | 8–12 wk* | Migration milestones met; RC approved |

## Two shipping milestones

**Milestone A — Consumer Play release (Termux mode):** W1 → W2 → W7 → QA/release. (W5 onboarding shell and W6 can stage in parallel; W3 spike runs independently in the background of this track.)

**Milestone B — Managed-runtime release:** W3 → W4 → W5 → W10, with W8 monetization integrated, W9 legal parallel.

## Parallel vs serial

- **Parallel:** W1 · W2 · W3 (clear interfaces) · W4 (after W3 skeleton) · W5 · W7 assets · W9 legal
- **Serial:** W3 stabilization before full wheel-swap; W10 after contract stability; signing/listing after stable builds

## Top-3 slip risks (decision needed now)

1. **APK size / cold start (Chaquopy)** → enforce M1–M6 gates early; lock feature scope; staged wheel swaps. *Decision: accept the ≤80 MB / ≤6 s / ≤300 MB gates as hard.*
2. **Update-channel security** → signed manifests + cert pinning + staging rollback tests. *Decision: adopt hybrid channel (Play base + signed in-app) — already the 4/4 consensus.*
3. **Onboarding/import integrity** → auditable import, offline/partial-data tests, consent flows. *Decision: ship Milestone A onboarding as Termux-pairing-first (existing, proven), add managed onboarding with W5.*

## Immediate next action

Start Phase 0 (RuntimeClient + Termux wrapper + integration tests) and lock the interfaces so W2 (attachments e2e) and W3 (spike) run in parallel without rework.
