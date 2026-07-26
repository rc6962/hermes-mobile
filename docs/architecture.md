# Initial architecture

## Components

```text
Hermes Mobile APK
  React/TypeScript UI
  Capacitor Android shell
  Native Termux lifecycle bridge
        |
        | 127.0.0.1:8642 + bearer key
        v
Hermes Agent API server in Termux
  Agent loop
  Sessions / memory / skills
  Tools / MCP / providers
```

## Transport decision

Use Hermes' documented API server and its runs/SSE endpoints for chat. Do not depend on the dashboard's `/api/pty` terminal bridge for the mobile client.

## Security baseline

- Keep Hermes bound to `127.0.0.1` during development.
- Generate a per-install API key; never hard-code one in the APK.
- Use fixed allowlisted Termux helper commands for lifecycle operations.
- Treat Termux command execution as a privileged setup path, not a chat transport.
- Do not commit API keys, signing keys, or local Hermes state.

## First acceptance test

On a real Android device or emulator with supported Termux and Hermes installed:

1. the app reaches `GET /health`;
2. the app authenticates successfully;
3. a prompt creates a run;
4. streamed event text appears in the chat;
5. stop cancels an active run;
6. closing/reopening the app can reconnect to the backend.

## Provisional Android identity

| Property | Value |
|---|---|
| Application ID (provisional) | `com.rickcain.hermesmobile` |
| Minimum SDK | API 26 (Android 8.0 Oreo); raise only if a required dependency mandates a higher floor |
| Compile SDK / Target SDK | API 36 (Android 16) — current installed stable platform |
| Initial distribution | Private debug APK + GitHub Actions workflow artifact; no Play Store listing planned for the first release |
| Supported runtime | Android device with [Termux](https://termux.dev) installed (F-Droid build, not Play Store build) |

The application ID is provisional and may change before the first public release. See [`platform-support.md`](platform-support.md) for the full support policy.
