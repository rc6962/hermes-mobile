# Termux backend setup checklist

This checklist is for validating the real Android backend before adding native lifecycle automation. The APK is only a client; Hermes Agent remains installed and configured inside Termux.

## 1. Install supported Termux

Use a current Termux build from [F-Droid](https://f-droid.org/packages/com.termux/) or the
[official GitHub releases](https://github.com/termux/termux-app/releases). Do not use the
unmaintained Play Store build.

Install the Termux packages needed by the documented Hermes Android path:

```bash
pkg update && pkg upgrade
pkg install git python curl
```

Keep Termux and any companion packages from the same distribution source.

## 2. Install Hermes using the Termux path

Follow the current official guide:

<https://hermes-agent.nousresearch.com/docs/getting-started/termux>

For a checkout of Hermes Agent, the documented dependency repair command is:

```bash
export ANDROID_API_LEVEL="$(getprop ro.build.version.sdk)"
python -m pip install -e '.[termux]' -c constraints-termux.txt
```

Complete `hermes setup` (or the provider-specific setup flow) inside Termux. Provider
credentials belong in the local Hermes configuration and must never be copied into this
repository or into the APK.

## 3. Enable the local API server

Generate a random local bearer value on the phone and keep it in the local shell/configuration.
Do not paste the generated value into chat, source files, screenshots, or Git:

```bash
# Example only; keep the output private.
API_SERVER_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export API_SERVER_KEY
export API_SERVER_ENABLED=true
export API_SERVER_HOST=127.0.0.1
export API_SERVER_PORT=8642
export API_SERVER_CORS_ORIGINS=http://localhost
```

The server must remain loopback-only. `API_SERVER_KEY` is required even when the server is
bound to `127.0.0.1`.

The same settings may be stored in the local Hermes profile configuration under the API-server
platform settings; keep the key out of tracked files.

## 4. Pair the Android app at runtime

The APK does not contain an API key. On first launch, choose **Pair with Hermes** and enter the
same `API_SERVER_KEY` value configured in Termux. The Android app stores the value using the
Android Keystore and never displays it after pairing. Use **Forget pairing** to remove the local
credential and pair again after rotating the key.

The pairing screen must be used on the phone; do not put the bearer value in `VITE_*` files or
commit it to the repository.

## 5. Start Hermes and verify health

Start the gateway process that hosts the API-server adapter:

```bash
hermes gateway run --replace
```

`hermes gateway` by itself is only a command group. `hermes serve` is the desktop
JSON-RPC/WebSocket backend and is not the `/v1/runs` API used by this project.

In a second Termux session, verify the local endpoints. The shell variable below must contain
the private value generated in the previous step; it is intentionally not shown here.

```bash
curl -fsS http://127.0.0.1:8642/health
curl -fsS http://127.0.0.1:8642/v1/capabilities \
  -H "Authorization: Bearer $API_SERVER_KEY"
```

Expected health is a JSON object with `"status": "ok"`. Capabilities should advertise
`run_submission`, `run_events_sse`, and the session endpoints before the APK exposes those
features.

## 6. Verify one streamed run manually

```bash
curl -fsS -X POST http://127.0.0.1:8642/v1/runs \
  -H "Authorization: Bearer $API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"Reply with exactly BACKEND_OK"}'
```

Copy only the returned `run_id` locally, then subscribe to its stream:

```bash
curl -N http://127.0.0.1:8642/v1/runs/REPLACE_WITH_LOCAL_RUN_ID/events \
  -H "Authorization: Bearer $API_SERVER_KEY"
```

The stream uses SSE. Comment lines such as `: keepalive` are transport keepalives and must be
ignored. JSON `data:` events include `message.delta`, tool lifecycle, approval, and terminal
run events. Do not use terminal output scraping as the app protocol.

## 7. Install the fixed lifecycle helper and prepare external-command permissions

The Capacitor bridge uses only explicit Termux `RUN_COMMAND` intents for fixed operations. Copy
the reviewed helper to the Hermes home directory and make it executable:

```bash
cp termux-backend/mobile-lifecycle.sh "$HOME/.hermes/mobile-lifecycle.sh"
chmod 700 "$HOME/.hermes/mobile-lifecycle.sh"
```

The installed helper accepts only `start`, `stop`, `restart`, `doctor`, and `update`. It never
accepts arbitrary command text, and it does not contain the API key. Before testing the bridge:

1. Read the official [RUN_COMMAND Intent documentation](https://github.com/termux/termux-app/wiki/RUN_COMMAND-Intent).
2. Use a Termux build that supports `RUN_COMMAND` intents.
3. Enable Termux's external-command setting (`allow-external-apps=true`) only after reviewing
   the current official instructions, then restart Termux if requested.
4. Grant the Android `com.termux.permission.RUN_COMMAND` permission to the calling app when
   Android presents that permission path.
5. Test the fixed `doctor` operation before allowing start/stop/update operations.

The APK must never pass arbitrary chat text or user-entered shell text through `RUN_COMMAND`.
Normal chat always uses the authenticated HTTP/SSE API.

## 8. Android acceptance checklist

Before calling the backend ready:

- [ ] Termux is from a supported distribution and opens normally.
- [ ] Hermes provider setup succeeds locally.
- [ ] `/health` responds on `127.0.0.1:8642`.
- [ ] `/v1/capabilities` accepts the bearer key.
- [ ] One `/v1/runs` request returns `202` and a `run_id`.
- [ ] The events stream stays open until a terminal event and tolerates keepalives.
- [ ] Invalid/missing bearer keys are rejected.
- [ ] The API is not reachable through the phone's LAN address.
- [ ] No credential appears in Git, APK resources, URL query strings, or logs.

Record device model, Android version, Termux version, Hermes commit/version, and the date of
the test separately from this repository. Never record the bearer or provider keys.
