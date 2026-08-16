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
import subprocess
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
        try:
            import aiohttp.web  # noqa: PLC0415
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"aiohttp import failed: {exc}"}
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


# --- Local Podule: on-device llama.cpp -------------------------------------

LOCAL_LLAMA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "llama")
LOCAL_LLAMA_SERVER = os.path.join(LOCAL_LLAMA_DIR, "llama-server")
LOCAL_MODEL_NAME = os.environ.get("BALLS_LOCAL_MODEL_NAME", "qwen3-0.6b")

_llama_proc = None


def start_local_model(gguf_path: str, port: int = 8080) -> dict:
    """Launch the vendored llama-server (OpenAI-compatible) on loopback.

    The GGUF must already be on disk (downloaded at onboarding). Returns the
    provider fragment the embedded Hermes needs, or an error.
    """
    global _llama_proc
    if _llama_proc is not None and _llama_proc.poll() is None:
        return {"ok": True, "already_running": True, "port": port}

    gguf = os.path.expanduser(gguf_path)
    if not os.path.isfile(gguf):
        return {"ok": False, "error": f"local model not found: {gguf}"}
    if not os.path.isfile(LOCAL_LLAMA_SERVER):
        return {"ok": False, "error": f"llama-server missing in {LOCAL_LLAMA_DIR}"}

    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = LOCAL_LLAMA_DIR
    try:
        _llama_proc = subprocess.Popen(
            [
                LOCAL_LLAMA_SERVER,
                "--model", gguf,
                "--host", "127.0.0.1",
                "--port", str(port),
                "--ctx-size", "4096",
                "--threads", "4",
                "--no-warmup",
            ],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"llama-server failed to start: {exc}"}

    # Wait for the OpenAI-compatible health endpoint (up to 60s — first
    # load of a 4-bit model on a phone takes a while).
    deadline = time.time() + 60
    last_error = "no response"
    while time.time() < deadline:
        if _llama_proc.poll() is not None:
            return {"ok": False, "error": "llama-server exited during startup"}
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/health", timeout=2
            ) as resp:
                if resp.status == 200:
                    return {
                        "ok": True,
                        "port": port,
                        "provider": {
                            "base_url": f"http://127.0.0.1:{port}/v1",
                            "model": LOCAL_MODEL_NAME,
                        },
                    }
                last_error = f"health status {resp.status}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(1)
    return {"ok": False, "error": f"llama-server startup timed out: {last_error}"}


def stop_local_model() -> dict:
    """Best-effort stop of the local llama server."""
    global _llama_proc
    if _llama_proc is not None:
        try:
            _llama_proc.terminate()
            _llama_proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            _llama_proc.kill()
        _llama_proc = None
    return {"ok": True, "stopped": True}


def local_model_status() -> dict:
    """Whether the local llama server is up."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=2) as resp:
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
