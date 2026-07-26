# Platform support policy

## Android identity

| Property | Value | Notes |
|---|---|---|
| Application ID | `com.rickcain.hermesmobile` | Provisional; may change before the first public release. |
| Minimum SDK | API 26 (Android 8.0 Oreo) | Will be raised only if Capacitor or a required dependency mandates a higher floor. |
| Compile SDK / Target SDK | API 36 (Android 16) | Current installed stable Android SDK platform. |
| Build tools | 36.0.0 | Minimum; update when the Android SDK build-tools revision advances. |
| Kotlin | Latest stable via Gradle plugin | Managed by the Gradle version catalog. |
| Java | JDK 17+ | Required by Capacitor Android and AGP 8.x. |

## Distribution strategy

| Channel | Method | Notes |
|---|---|---|
| Development debug | `./gradlew assembleDebug` | Signed with debug keystore; not for production use. |
| CI artifact | GitHub Actions workflow | Each push to `main` builds and uploads a debug APK as a workflow artifact. |
| Public release | Not yet defined | No Play Store, side-loading, or distribution channel has been chosen for the first milestone. |

## Supported runtime

The Hermes Mobile APK is designed to run on an Android device (phone or tablet) that also has **Termux** installed. The Termux installation acts as the host for the Hermes Agent API server backend.

### Termux requirements

| Requirement | Details |
|---|---|
| Source | **F-Droid build required** — the Play Store version of Termux is no longer maintained and is incompatible with modern Android API levels. Install from [F-Droid](https://f-droid.org/packages/com.termux/) or [GitHub releases](https://github.com/termux/termux-app/releases). |
| Minimum Termux version | v0.118.0 or later (supports `RUN_COMMAND` intents). |
| Hermes Agent | Installed and configured inside Termux; exposes its API server on `127.0.0.1:8642`. |
| API key | Per-install bearer key stored in Android secure storage, not in the APK. |

### Unsupported configurations

- Android emulators without Termux installed.
- Chromebooks running Android apps (not tested).
- Devices without Google Play Services or a comparable WebView implementation (the Capacitor WebView is required).
- Root-only environments that bypass Termux.

## SDK version rationale

- **API 26 (Android 8.0)** was chosen as the provisional minimum because:
  - It covers the vast majority of active Android devices (>95% as of mid-2026).
  - Termux F-Droid builds require at least API 24; API 26 adds `NotificationChannel` and other APIs that simplify setup.
  - Capacitor 6+ officially supports API 26+.
- **API 36 (Android 16)** is the compile/target SDK because it is the current stable release and is already installed in the development environment.

If a dependency later requires a higher `minSdk` (e.g., a new Capacitor major version drops older API levels), the minimum will be raised to match — but it will not be raised speculatively.

## Signing

- **Debug builds** use the standard Android debug keystore (auto-created by the Android SDK).
- **Release builds** are not configured yet. No signing keys, keystore passwords, or alias names are committed to this repository.
- All APKs for the first milestone are unsigned debug builds distributed as CI artifacts.

## API keys and credentials

- No API keys, signing keys, or credentials of any kind are stored in this file or anywhere in the repository.
- The Hermes API bearer key is generated per-install and stored in Android secure storage (EncryptedSharedPreferences).
- Provider API keys for Hermes Agent (OpenAI, etc.) are configured inside Termux and never embedded in the APK.
