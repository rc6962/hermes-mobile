# Hermes Mobile Documentation Hub

**Audience:** Rick, human collaborators, and AI coding agents  
**Repository:** `D:\Hermes\hermes-mobile`  
**Product direction:** A self-contained Hermes Android product, with existing Termux as an optional advanced/development runtime.

This file is the starting point for understanding the project. Read it first, then follow the links for the area you are working on.

## Start here

| Question | Read |
|---|---|
| What are we building and what is still undecided? | [Product direction and acceptance backlog](product-direction-and-acceptance-backlog.md) |
| How does the Android bridge work? | [Android bridge architecture](android-bridge-architecture.md) |
| What commands and safety rules are allowed? | [Android bridge protocol](android-bridge-protocol.md) |
| What is the current implementation state? | [Current status](#current-status) |
| Where should new research or decisions go? | [Documentation rules](#documentation-rules) |

## Current status

### Completed and verified

- Native Android HTTP/SSE transport for the Hermes backend.
- Session handling and stream lifecycle hardening.
- Fixed Termux lifecycle action path and bounded reconnect polling.
- Explicit chat activity states for connecting, thinking, responding/tool-running, approval, stopping, completion, cancellation, and failure; raw tool previews are withheld.
- Status-only Android capability bridge; Accessibility remains opt-in and disabled by default.
- Frontend tests, typecheck, lint, production build, Android debug build, and physical S24 Ultra installation checks for the existing baseline.

### Active implementation priorities

1. **Runtime direction:** self-contained/managed runtime is the default product; Termux is an optional adapter.
2. **First-run setup:** branch clearly between managed mode and advanced Termux mode.
3. **Visual system:** establish reusable layout/theme structure early, then iterate on mockups and polish alongside functional work; review the visual directions with Rick before finalizing them.
4. **Managed runtime architecture:** define staged implementation, migration, storage, updates, and provider boundaries.
5. **Brand review:** evaluate the generated shortlist before changing display name, package ID, or public identity.

### Approved

- Product name: **Balls** (app and AI persona; modules are Podules; company: Epic Technologies). See `docs/balls-naming-decision.md`.
- Android application ID: `com.epictechs.balls` (v0.2.10, debug-verified on S24 Ultra).

### Not yet approved

- Public domain (`balls.ai` taken; `balls.app` for sale — deferred).
- Play Store release, monetization, signing, or store submission.
- Accessibility automation.

## Product definition

```text
One Android app
  ├─ Managed Hermes runtime                 default customer experience
  └─ Existing Termux Hermes runtime        advanced/developer compatibility mode
```

The UI should use a runtime-neutral adapter so the chat, sessions, streaming, approvals, stop/cancel, health, and activity-status surfaces do not depend on which runtime is underneath.

## Documentation map

### Product and acceptance

- [Product direction and acceptance backlog](product-direction-and-acceptance-backlog.md) — product scope, runtime modes, setup behavior, branding constraints, layout goals, and acceptance areas.

### Architecture and protocols

- [Android bridge architecture](android-bridge-architecture.md) — current status/settings-only bridge and its safety boundary.
- [Android bridge protocol](android-bridge-protocol.md) — fixed action allowlist and protocol details.

### Verification evidence

- [Run activity status — 2026-08-02](verification/2026-08-02-run-activity-status.md) — frontend, Android artifact, and S24 Ultra verification.

### Architecture roadmaps

- [Managed Runtime Architecture Roadmap](architecture/managed-runtime.md) — product boundary, runtime options, feasibility gate, staged delivery, security rules, and release gates.

### Design and architecture docs

- [Settings, themes, console, and session navigation](design/settings-themes-console-sessions.md) — switchable themes, standard/advanced settings, safe Hermes Console, and scalable session browser.

### Still to add

- `architecture/runtime-adapter.md` — common interface for managed and Termux runtimes (to be created in the first implementation slice).
- `decisions/` — short ADR-style decisions with date, context, decision, and consequences.
- `research/` — external research with source URLs, date checked, and conclusions.
- `design/` — mockup links, selected direction, tokens, screenshots, and rejected alternatives.
- `verification/` — reproducible test evidence, APK inspection, device, build, and date.

## Documentation rules

### One source of truth per topic

- Product scope and acceptance: `product-direction-and-acceptance-backlog.md`.
- Architecture: `docs/architecture/`.
- Decisions: `docs/decisions/`.
- External research: `docs/research/`.
- Visual design: `docs/design/`.
- Reproducible verification: `docs/verification/`.

Do not create another loose planning file when the topic already has a home.

### Every decision record should contain

1. Date and status (`proposed`, `accepted`, `rejected`, or `superseded`).
2. Context/problem.
3. Decision.
4. Alternatives considered.
5. Consequences and follow-up work.

### Every research record should contain

1. Question and scope.
2. Sources and URLs.
3. Date checked.
4. Facts versus interpretation.
5. Resulting product or engineering impact.

### Every verification record should contain

1. Commit or working-tree reference.
2. Exact command/test.
3. Device and environment.
4. Result and artifact path.
5. Known limitations or manual steps.

Secrets, API keys, pairing tokens, passwords, and unredacted environment dumps must never be stored in this documentation tree.

## How to use this hub

### Human workflow

1. Open `docs/README.md`.
2. Read the product backlog before changing scope.
3. Open the architecture document for the subsystem being modified.
4. Check the current status and planned documents above.
5. Review verification evidence before treating a feature as complete.

### AI workflow

1. Load this hub first.
2. Load the linked subsystem document before editing code.
3. Check whether the requested change conflicts with an accepted decision.
4. Add or update the smallest appropriate decision/research/verification record.
5. Report exact files, tests, artifacts, and remaining risk.

## Repository boundaries

- Application source: `mobile/`
- Termux compatibility backend: `termux-backend/`
- Android bridge implementation: `mobile/android/` and `termux-backend/android-bridge-plugin/`
- Product and engineering documentation: `docs/`
- Plans and session-local planning material: `.hermes/plans/`
- Generated screenshots/build evidence: `.tmp/` (not source documentation)
