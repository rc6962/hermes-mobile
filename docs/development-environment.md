# Development Environment

## Prerequisites

Build and run the Hermes Mobile frontend requires the following tools installed and
discoverable on your `PATH`:

| Tool | Minimum | Required for |
|------|---------|-------------|
| Node.js | 18.x | Frontend build, dev server, environment diagnostics |
| npm | (bundled with Node) | Package management |
| Java | 21+ | Capacitor 8 Android tooling, Gradle, APK packaging |
| Android SDK command-line tools | — | Platform compilation, device interaction |
| adb | (bundled with SDK) | Device/emulator communication |
| Gradle / Gradle wrapper | — | APK packaging (wrapper preferred) |

## Environment check script

A cross-platform diagnostic script is provided at
[`scripts/check-environment.mjs`](../scripts/check-environment.mjs).

### Usage

```bash
# Human-readable default output
node scripts/check-environment.mjs

# Machine-readable JSON
node scripts/check-environment.mjs --json

# Usage information
node scripts/check-environment.mjs --help
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Healthy or warning-only — the environment is usable for local development |
| 1 | A required runtime (Node, Java, Android SDK) is missing or unusable |
| 2 | Malformed invocation — unknown flags were passed |

### Checks performed

1. **Node.js and npm** — verifies the Node interpreter (major 18+) and that
   `npm --version` succeeds.  Fail if Node < 18; warn if npm is unavailable.

2. **Java** — runs `java -version` and parses the major number. Fail if Java
   is not found or major < 21.

3. **Android SDK root** — reads `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then
   probes well-known default locations:
   - Windows: `%LOCALAPPDATA%\Android\Sdk`, Scoop `android-clt` home
   - macOS: `~/Library/Android/sdk`
   - Linux: `~/Android/Sdk`, `/usr/lib/android-sdk`, `/opt/android-sdk`

   Fail if no SDK root can be resolved, or if the resolved path does not exist
   on disk.

4. **adb** — runs `adb version`.  Warn if adb is not on `PATH` (you can build
   without a device connected).

5. **SDK platform packages** — lists `$ANDROID_HOME/platforms/`.  Pass if a
   platform in the preferred set (android-36, -35, -34) is present.  Warn if
   none are installed or only non-preferred versions exist.

6. **Build-tools** — lists `$ANDROID_HOME/build-tools/`.  Pass if at least one
   version is installed.  Warn if the directory is empty or absent.

7. **Device attachment** — runs `adb devices -l`.  Warn if no device or
   emulator is connected (admittedly normal during initial setup).  Warn if
   adb is unavailable entirely.

8. **Gradle wrapper** — looks for `gradlew` in the project root,
   `mobile/android/`, and `android/`.  Falls back to system `gradle --version`.
   Warn if neither a wrapper nor a system `gradle` command exists.

### Warning vs. failure

- **Failures** — only for *unusable required runtimes*: Node missing/too old,
  Java missing/too old, Android SDK root absent. These block the build and
  must be fixed first.
- **Warnings** — everything else: missing SDK packages, no device, no Gradle
  wrapper, npm unavailable.  Development can proceed, but some commands will
  fail or produce suboptimal results.

### Example output

```
Hermes Mobile — Environment Check
═══════════════════════════════════

  ✔  Node.js v24.16.0  npm v11.13.0
  ✔  Java  openjdk version "21.0.2" 2024-01-16
  ✔  Android SDK  /Users/user/Library/Android/sdk
  ✔  adb  Android Debug Bridge version 1.0.41
  ✔  /Users/user/Library/Android/sdk/platforms  [android-35, android-34]
  ✔  /Users/user/Library/Android/sdk/build-tools  [35.0.0]
  ⚠  No Android device or emulator attached
  ✔  Gradle wrapper  ./gradlew  (v8.7)

  ●  Environment is usable for development, but address the warnings above
     for a smoother experience.
```

## Setting up the Android SDK

### Windows

The simplest approach is to install the command-line tools via Scoop:

```powershell
scoop bucket add java
scoop install android-clt openjdk21
```

Then accept the licenses and install the required packages:

```bash
sdkmanager --sdk_root=%ANDROID_HOME% "platforms;android-36"
sdkmanager --sdk_root=%ANDROID_HOME% "build-tools;36.0.0"
```

Set `ANDROID_HOME` to the SDK root (Scoop does this automatically on install).

### macOS / Linux

1. Install the Android command-line tools from the
   [Android Studio downloads page](https://developer.android.com/studio#command-line-tools-only)
   or via Homebrew (`brew install android-commandlinetools`).
2. Set `ANDROID_HOME` to the extracted or installed path.
3. Accept licenses and install platform/build-tools with `sdkmanager`.

## Setting up Java

Install JDK 21 or later. Capacitor 8 and the generated Android project require
Java 21 for Gradle compilation.

| Platform | Command |
|----------|---------|
| Windows (Scoop) | `scoop install openjdk21` |
| Windows (Chocolatey) | `choco install temurin21` |
| macOS (Homebrew) | `brew install openjdk@21` |
| Ubuntu/Debian | `sudo apt install openjdk-21-jdk` |
| Fedora | `sudo dnf install java-21-openjdk-devel` |

Verify with `java -version`.

## Obtaining adb

adb is part of the Android SDK platform-tools.  If the SDK is installed, adb
should be at `$ANDROID_HOME/platform-tools/adb` (or `adb.exe` on Windows).
Ensure `$ANDROID_HOME/platform-tools` is on your `PATH`.

## Gradle wrapper

If a `gradlew` file does not exist yet, generate one from the Android project
directory:

```bash
cd mobile/android
gradle wrapper
```

or from the project root if you have a `settings.gradle`:

```bash
gradle wrapper
```

The wrapper (`gradlew` + `gradle/wrapper/`) should be committed to the
repository so that CI and other developers use a pinned Gradle version.
