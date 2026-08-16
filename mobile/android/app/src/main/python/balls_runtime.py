"""balls_runtime — embedded managed runtime bootstrap (spike M3).

Boots the Hermes API server (gateway/platforms/api_server.py) inside the
embedded Chaquopy Python, bound to loopback on port 8642 — the same
contract the app already speaks in Termux mode.

The Kotlin side (NativeHostService / ManagedRuntimePlugin) calls
start_runtime() with the app-private HERMES_HOME, the pairing API key,
and an optional provider-config JSON (written to cli-config.yaml so the
embedded Hermes has working model credentials).
"""

import asyncio
import json
import logging
import os
import threading
import time
import urllib.request
from pathlib import Path

_LOG = logging.getLogger("balls_runtime")

DEFAULT_PORT = 8642
DEFAULT_HOST = "127.0.0.1"


def _run_loop(loop: asyncio.AbstractEventLoop, adapter) -> None:
    """Run the adapter's async connect() then keep the loop alive."""
    asyncio.set_event_loop(loop)
    try:
        ok = loop.run_until_complete(adapter.connect())
        _LOG.info("adapter connect returned %s", ok)
    except Exception as exc:  # noqa: BLE001
        _LOG.error("adapter connect raised: %s", exc)
        return
    loop.run_forever()


def _write_provider_config(home: Path, provider_json: str | None) -> None:
    """Write a minimal cli-config.yaml so the embedded Hermes has providers."""
    if not provider_json:
        return
    try:
        payload = json.loads(provider_json)
    except json.JSONDecodeError:
        _LOG.warning("provider JSON invalid; skipping config write")
        return
    cfg_path = home / "cli-config.yaml"
    lines = ["platforms:", "  api_server:", "    enabled: true"]
    providers = payload.get("providers")
    if isinstance(providers, dict) and providers:
        lines.append("providers:")
        for name, conf in providers.items():
            lines.append(f"  {name}:")
            for key, value in conf.items():
                lines.append(f"    {key}: {value}")
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _LOG.info("wrote cli-config.yaml (%d lines)", len(lines))


def start_runtime(
    hermes_home: str,
    api_key: str,
    port: int = DEFAULT_PORT,
    provider_json: str | None = None,
    model_name: str | None = None,
) -> dict:
    """Start the embedded Hermes API server. Returns a status dict."""
    home = Path(hermes_home)
    home.mkdir(parents=True, exist_ok=True)

    os.environ["HERMES_HOME"] = str(home)
    os.environ["API_SERVER_ENABLED"] = "true"
    os.environ["API_SERVER_KEY"] = api_key
    os.environ["API_SERVER_HOST"] = DEFAULT_HOST
    os.environ["API_SERVER_PORT"] = str(port)
    if model_name:
        os.environ["API_SERVER_MODEL_NAME"] = model_name

    _write_provider_config(home, provider_json)

    try:
        from gateway.platforms.api_server import (  # noqa: PLC0415
            APIServerAdapter,
            check_api_server_requirements,
        )
        from gateway.config import PlatformConfig  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"import failed: {exc}"}

    if not check_api_server_requirements():
        return {"ok": False, "error": "aiohttp unavailable in embedded env"}

    cfg = PlatformConfig(
        enabled=True,
        api_key=api_key,
        extra={"host": DEFAULT_HOST, "port": port, "key": api_key},
    )
    adapter = APIServerAdapter(cfg)
    loop = asyncio.new_event_loop()
    thread = threading.Thread(
        target=_run_loop, args=(loop, adapter), name="balls-runtime", daemon=True
    )
    thread.start()

    # Readiness: poll /health until it answers or we time out.
    deadline = time.monotonic() + 20.0
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(
                f"http://{DEFAULT_HOST}:{port}/health", timeout=2
            ) as resp:
                if resp.status == 200:
                    return {"ok": True, "port": port, "pid": os.getpid()}
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(0.4)

    return {"ok": False, "error": f"health check timed out: {last_error}"}


def stop_runtime() -> dict:
    """Best-effort stop: the daemon thread dies with the interpreter, so
    this exists for parity with the plugin contract and future in-app
    restart flows."""
    return {"ok": True, "stopped": True}


def status() -> dict:
    """Return whether the embedded server answers on the default port."""
    try:
        with urllib.request.urlopen(
            f"http://{DEFAULT_HOST}:{DEFAULT_PORT}/health", timeout=2
        ) as resp:
            return {"ok": True, "running": resp.status == 200}
    except Exception:  # noqa: BLE001
        return {"ok": True, "running": False}


if __name__ == "__main__":
    # Standalone smoke: python -m balls_runtime --home <dir> --key <key>
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--provider-json", default=None)
    args = parser.parse_args()
    result = start_runtime(args.home, args.key, args.port, args.provider_json)
    print(json.dumps(result))
