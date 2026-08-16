# Settings, themes, console, and session navigation

- **Status:** accepted product requirement; design-first, implementation pending.
- **Date:** 2026-08-02

## Theme switching

The product should ship with curated themes rather than an unrestricted color editor:

- **Soft Haven:** light, calm, consumer-friendly option.
- **Gentle Command:** dark, private, focused option.

During first-run setup, ask the user to choose their initial theme and remember the choice. Theme changes are local presentation preferences. They must not change runtime behavior, credentials, provider selection, or session data. The setting should persist across relaunch and apply consistently to onboarding, chat, settings, console, errors, and dialogs.

The implementation should use shared semantic tokens, not separate hard-coded screens. A future theme can then be added without rewriting the UI.

Recommended preference shape:

```ts
interface PresentationPreferences {
  theme: "soft-haven" | "gentle-command";
  sessionNavigation: "drawer" | "top-strip" | "transcript-first";
  showActivityConsoleOnChat: boolean;
}
```

## Settings information architecture

The header should contain one clear settings button. The normal settings surface should be understandable without Hermes knowledge:

1. **Appearance**
   - Theme: Soft Haven / Gentle Command.
   - Session navigation placement.
   - Show live activity console in chat.
2. **Model**
   - Provider and model selection from runtime capabilities.
   - Users may add/change providers and models in the Hermes-like provider-agnostic flow.
   - Do not lock the initial managed runtime to an Epic-owned model or provider.
   - Clear indication of whether a model is local, user-provided, or remotely hosted.
   - Safe validation before saving.
3. **Hermes behavior**
   - Approval preference.
   - Response/tool activity verbosity.
   - Default session behavior.
   - Runtime start/reconnect behavior.
4. **Privacy and data**
   - Credential management.
   - Export/delete profile data.
   - Diagnostics redaction.
5. **About and support**
   - Runtime version, protocol version, diagnostics, documentation, and support path.

## Advanced settings

Advanced settings should be a separate, clearly labeled section or screen rather than adding complexity to the standard view. It may expose:

- profile selection;
- raw-but-redacted runtime configuration view;
- provider endpoint and timeout controls;
- tool/approval policy details;
- lifecycle and update channels;
- debug logging level;
- doctor, restart, reset, and recovery actions.

Every advanced change should show scope, risk, current value, proposed value, and an explicit save/confirm action. Destructive actions require a second confirmation and explain what data is affected.

## Hermes Console

A GUI-friendly terminal-style surface is valuable, especially for the owner, developers, and advanced users. It should be called **Hermes Console** rather than simply “Terminal” so ordinary users do not assume it is a general Android shell.

### Standard console behavior

- Read-only live activity/log stream by default.
- Structured command cards for `doctor`, `status`, `start`, `stop`, `restart`, `update`, configuration inspection, and export/reset.
- Searchable logs with timestamps and severity filters.
- Copy diagnostics with secrets and personal data redacted.
- Clear visual distinction between agent activity, runtime lifecycle, warnings, and errors.

### Advanced console behavior

If the managed runtime proves that a true command console is safe and distributable, an advanced command editor may be added behind an explicit Advanced Mode toggle. It must remain scoped to the managed Hermes runtime, validate commands against an allowlist or parser, display a preview/diff for configuration edits, and never become arbitrary device shell access by accident.

The Termux adapter must retain its existing fixed lifecycle allowlist. Ordinary chat text must never be forwarded as a shell command.

## Main-screen console option

The default chat stays clean. A user preference named **Show activity console in chat** may add a collapsible panel below the run status or above the composer. The panel should start collapsed unless a run is active or a user explicitly pins it open.

This provides the “Henworks-style” owner/power-user view without making the consumer experience feel like a terminal.

## Session scaling

A fixed list on the left or top is not sufficient for many conversations. The session UI should use progressive disclosure:

- show the current session and a short Recent list in the compact layout;
- provide an **All conversations** action that opens a full-screen or modal session browser;
- include search/filter, pinned sessions, recent sessions, and archived sessions;
- display timestamps and short titles, with ellipsis rather than layout overflow;
- support a new-session action from both the browser and chat header;
- on phones, use a drawer or sheet; on wide screens, use a resizable sidebar or secondary pane;
- preserve the current session while browsing and confirm before abandoning unsent composer text.

This keeps the main surface usable whether there are three chats or three hundred.

## Acceptance criteria

- Switching between Soft Haven and Gentle Command updates the complete app shell without a reload and persists after relaunch.
- The settings button is reachable from chat, onboarding, and the session browser.
- Standard users can select a model and normal Hermes behavior without seeing raw configuration syntax.
- Advanced users can inspect safe runtime details and launch doctor/restart/recovery flows.
- The Hermes Console never exposes secrets in screen output, copied diagnostics, or logs.
- The main-screen console is opt-in and collapsible.
- A session collection larger than the compact list remains searchable and navigable without pushing the composer off-screen.
- The same behavior is validated in Soft Haven and Gentle Command on the S24 Ultra.
