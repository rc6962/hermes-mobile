# Hermes Mobile Product Direction and Acceptance Backlog

Status: active product-direction backlog; no item below authorizes a release commit, public branding change, or Accessibility enablement.

## 1. Runtime modes and first-run setup

### Product direction

The **self-contained Hermes runtime is the primary product and intended final experience**. A normal customer should install one app, complete one guided setup, and use Hermes without knowing that Termux exists.

An **existing-Termux compatibility mode** remains valuable for advanced users, development, migration, and devices where the managed runtime is unavailable. It should be an explicit secondary choice, not the default onboarding path.

### Self-contained mode setup

1. Explain the local/private runtime and secure credential setup in plain language.
2. Initialize or import the managed Hermes runtime profile.
3. Verify local storage, runtime readiness, provider configuration, and authenticated health.
4. Verify one bounded chat stream.
5. Keep optional Accessibility capabilities separate and disabled until explicitly enabled.

### Optional Termux mode setup

1. Explain that Termux is an advanced compatibility mode.
2. Detect the supported Termux package/build and guide installation only if the user chooses this mode.
3. Verify the fixed lifecycle helper at `$HOME/.hermes/mobile-lifecycle.sh` through a safe status path.
4. Open Hermes Mobile's App Info page so the user can grant `Run commands in Termux environment` under Android's Additional permissions when available.
5. Guide the user through Termux's `allow-external-apps=true` property without exposing the API key.
6. Return to Hermes Mobile and verify every permission/state change after `onResume`.
7. Pair with or import the existing local Hermes connection securely.
8. Verify authenticated health and one bounded chat stream.

### Shared rules

- Every setup step must show: current state, why it is needed, the exact next action, and a verified result.
- The user must return to Hermes Mobile after each external settings/install step; the app re-checks automatically.
- Android cannot silently install Termux or grant privileged permissions.
- Do not pass arbitrary chat text through `RUN_COMMAND`; retain the fixed action allowlist.
- Keep Accessibility disabled unless the user separately opts in; if enabled later, open Android Accessibility settings and verify the service after returning.

## 2. Product name

**Decision: the product is named Balls** (accepted 2026-08-12; see `docs/balls-naming-decision.md`).

- App name: **Balls**. The AI assistant persona is also Balls; no suffix.
- Modules are **Podules** (Finance Podule, Voice Podule, Code Podule).
- Attribution: **Balls, an Epic Technologies product**.
- Tagline: **"Balls: have some."** Free tier "Balls Deep"; paid tier "Whole Balls".
- The name must not be changed again without a new decision record. "Hermes" remains only as internal engine attribution and in developer docs, never as user-facing branding.

Open items that remain separate decisions: final domain, Android signing identity, and Play Store listing details.

## 3. Company, domain, and Android identity

The personal-name `.com` identity should not be the public product identity.

### Preferred separation

- Company/legal attribution: **Epic Technologies**.
- Product name: selected after the naming review.
- Public website: a short company-owned domain or product subdomain; availability and trademark status must be checked before adoption.
- Android application ID: keep the current ID provisional until the product name is accepted; changing it later makes Android treat the result as a new application and can affect updates, stored data, and pairing migration.

### Required before release

- Decide whether the APK is branded as `Product by Epic Technologies` or `Epic Technologies — Product`.
- Reserve/verify the domain and relevant social/app-store identities without putting credentials in the repository.
- Choose the final Android application ID before the first public release.
- Add an explicit migration plan if the package ID or stored preference namespace changes.

## 4. Layout, navigation, and theme options

The current interface has a sessions control above the transcript and a dark navy visual system. Add user-selectable presentation modes rather than maintaining separate hard-coded screens.

### Candidate preferences

- `sessionNavigationPlacement`: `top | left | right | hidden`.
- `theme`: initial curated themes rather than arbitrary color editing; first candidates are `soft-haven` and `gentle-command`.
- `showActivityConsoleOnChat`: opt-in collapsible runtime activity panel.
- Persist preferences locally and restore them after relaunch.
- Keep the composer and transcript behavior consistent across modes.
- Add responsive breakpoints so a phone does not receive a desktop-width sidebar by accident.

### Settings and advanced controls

The app should provide a standard Settings area for appearance, model/provider selection, normal Hermes behavior, privacy/data controls, and runtime information. Advanced Hermes settings should be a clearly separated section containing deeper profile, provider, policy, lifecycle, debug, doctor, restart, update, and recovery controls.

A safe, GUI-friendly **Hermes Console** should be available under Advanced settings. It should show redacted runtime logs and structured actions such as status, doctor, start, stop, restart, update, configuration inspection, and export/reset. The default chat remains clean, but users may opt into a collapsible activity console on the main screen. This is not arbitrary Android shell access; configuration changes require validation, preview/confirmation, and secret redaction.

### Candidate session placements

- Top: compact horizontal recent-session strip.
- Left: drawer/sidebar on wide screens or landscape tablets.
- Right: optional secondary drawer for recent sessions and actions.
- Hidden: transcript-first mode with a session button in the header.

### Candidate visual directions

- Calm navy/blue: current direction, more compact and focused.
- Graphite/amber: technical operations console with warm status accents.
- Paper/indigo: lighter, more approachable assistant surface.
- Obsidian/teal: premium local/private-runtime identity.

Each direction needs a screenshot comparison, contrast/accessibility review, and physical S24 validation.

## 5. Managed runtime and advanced Termux compatibility

### Managed runtime — primary product path

The self-contained Android runtime is the primary product direction. The normal onboarding flow should not ask a customer to install or configure Termux.

The required staged architecture, runtime boundary, feasibility gate, lifecycle constraints, security rules, migration strategy, and release gates are documented in [Managed Runtime Architecture Roadmap](architecture/managed-runtime.md).

### Existing Termux — advanced compatibility mode

The existing-Termux path remains useful for developers, advanced users, migration, and recovery. It should be offered explicitly as an advanced choice rather than surfaced as the default setup requirement.

When selected, the compatibility wizard must:

- identify whether a supported Termux installation exists;
- explain the external-runtime requirement clearly;
- guide the fixed lifecycle helper and Android permission steps;
- return to the app and verify state after each external action;
- preserve the fixed lifecycle action allowlist and never expose the API key.

## Acceptance-matrix additions to collect next

Before the next implementation cycle, capture the user's remaining requirements under these headings:

- first-run setup and recovery;
- chat/session behavior;
- lifecycle/reconnect/stop behavior;
- permissions and privacy;
- naming/branding/domain;
- layout/navigation preferences;
- Termux installation and upgrade behavior;
- future managed-runtime expectations;
- release/distribution requirements.

## Balls voice (brand copy rules, accepted 2026-08-16)

All user-facing copy — especially **error messages** — uses low-key adult humor: funny, warm, never raunchy, never mean. Think the tagline "Balls: have some." Applied to errors, not to product/technical copy.

Rules:
1. Errors and empty states get a wink ("That's your daily Balls allowance, spent. Whole Balls = unlimited rounds."). Success messages stay dry ("Saved. Balls won't forget.").
2. Never raunchy, never crude, never sexual. Double-entendre is fine; explicit is not.
3. Never mock the user — the joke is on Balls ("Balls tripped over a cable."), not on them.
4. Keep it short: one line, one joke. No strings of gags.
5. Legal/safety/security notices stay plain and serious — humor only on recoverable errors and empty states.
