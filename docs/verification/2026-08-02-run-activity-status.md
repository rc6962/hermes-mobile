# Verification: Run activity status

- **Date:** 2026-08-02
- **Status:** passed
- **Scope:** Explicit, safe run-state visibility in the Hermes Mobile chat UI.

## Behavior verified

- A run accepted by Hermes changes from connection startup to a visible **thinking** state.
- A completed run leaves a visible terminal completion state instead of silently removing all status.
- A live tool auto-expands the activity panel.
- The activity panel shows the tool name, state, completion count, duration when available, and error marker when applicable.
- Raw tool previews/arguments are not rendered in the activity panel.

## Automated verification

From `mobile/`:

```text
npm run test:run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Result:

- 18 Vitest files passed.
- 79 tests passed.
- TypeScript typecheck passed.
- ESLint passed.
- Vite production build passed.
- `git diff --check` passed.

Focused status coverage:

```text
src/components/__tests__/ChatView.test.tsx
src/components/__tests__/RunActivity.test.tsx
```

The tests were written/observed failing before the corresponding thinking, completion, and live-tool panel behavior was implemented.

## Android artifact

```text
Package: com.rickcain.hermesmobile
Version code: 8
Version name: 0.2.8
APK: mobile/.android-build/app/outputs/apk/debug/app-debug.apk
```

`./gradlew :app:assembleDebug --no-daemon --max-workers=1 -Dkotlin.compiler.execution.strategy=in-process` completed successfully.

## Physical-device verification

- **Device:** Samsung S24 Ultra (`SM-S928U`)
- **Transport:** USB ADB
- **Install:** `adb install -r` succeeded.
- **Launch:** `com.rickcain.hermesmobile/.MainActivity` resumed normally.
- **Connection:** UI reported Online.
- **Bounded live test:** A response-only prompt showed the live thinking label, then a persistent completed label after completion.

## Known limitations

- The real-device session did not emit a tool event during this bounded response-only test. Tool-running activity is covered by the focused component regression test.
- The app is still branded provisionally as `Hermes Mobile`; no product name, domain, package ID, signing, or store-release decision has been made.
