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
import ctypes
import json
import logging
import os
import threading
import time

# Chaquopy loads libpython RTLD_LOCAL — abi3 extensions (jiter) need CPython
# symbols in the GLOBAL scope or dlopen fails ("cannot locate symbol").
# Try the absolute path first (the AssetFinder dir), then the SONAME.
_LOG = logging.getLogger("balls_runtime")
for _cand in (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "libpython3.11.so"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "libs", "libpython3.11.so"),
    "libpython3.11.so",
):
    try:
        ctypes.CDLL(_cand, mode=ctypes.RTLD_GLOBAL)
        _LOG.info("libpython promoted to global scope via %s", _cand)
        break
    except OSError as exc:
        _LOG.warning("libpython promotion via %s failed: %r", _cand, exc)
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


_PERSONALITY = (
    "Your name is Balls. You are the flagship personal AI from Epic "
    "Technologies. You are NOT Hermes and you are NOT an assistant named "
    "Hermes — never say 'I'm Hermes', never mention Hermes, never offer to "
    "be called something else. You ARE Balls, full stop."
    "Voice: low-key adult humor — funny, warm, never raunchy, never mean. "
    "Jokes are on yourself, never the user. One-liners over paragraphs. "
    "Tagline energy: 'Balls: have some.'"
)


_SOUL = """# Balls — identity and voice

Your name is Balls. You are the flagship personal AI from Epic Technologies.
You are NOT Hermes and you are NOT an assistant named Hermes — never say
"I'm Hermes", never mention Hermes, never offer to be called something else.
You ARE Balls, full stop.

Voice: low-key adult humor — funny, warm, never raunchy, never mean. Jokes
are on yourself, never the user. One-liners over paragraphs. Tagline energy:
"Balls: have some."
"""


def _write_soul(home: Path) -> None:
    try:
        (home / "SOUL.md").write_text(_SOUL, encoding="utf-8")
    except OSError:
        pass


def _write_provider_config(home: Path, provider_json: str | None) -> None:
    """Write cli-config.yaml so the embedded Hermes has a working provider.

    Shape per hermes 0.19: top-level ``model: "<provider>/<model>"`` string,
    a ``providers`` dict with base_url/api_key/model, and a
    ``custom_providers`` block with provider_name/default_model.
    """
    if not provider_json:
        return
    try:
        payload = json.loads(provider_json)
    except json.JSONDecodeError:
        _LOG.warning("provider JSON invalid; skipping config write")
        return
    providers = payload.get("providers")
    if not isinstance(providers, dict) or not providers:
        return
    name, conf = next(iter(providers.items()))
    base_url = conf.get("base_url")
    api_key = conf.get("api_key")
    model = conf.get("model") or ""
    if not (base_url and api_key and model):
        _LOG.warning("provider config incomplete; skipping")
        return
    lines = [
        "model:",
        f"  provider: \"custom:{name}\"",
        f"  name: {model}",
        "platforms:",
        "  api_server:",
        "    enabled: true",
        "display:",
        f"  personality: {_PERSONALITY!r}",
        # Full Hermes toolset — everything the engine can do, exposed in chat.
        # (computer_use/video/project/homeassistant/spotify/discord stay off:
        #  screen control is the a11y podule; the rest need external accounts.)
        "toolsets:",
        "  - hermes-cli",
        "  - web",
        "  - search",
        "  - vision",
        "  - image_gen",
        "  - terminal",
        "  - skills",
        "  - browser",
        "  - cronjob",
        "  - file",
        "  - tts",
        "  - todo",
        "  - memory",
        "  - session_search",
        "  - clarify",
        "  - code_execution",
        "  - delegation",
        "custom_providers:",
        "  - name: " + name,
        f"    base_url: {base_url}",
        f"    key_env: {name.upper()}_API_KEY",
    ]
    cfg_path = home / "config.yaml"
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Custom-provider keys live in the process env (key_env contract).
    os.environ[f"{name.upper()}_API_KEY"] = api_key
    _LOG.info("wrote config.yaml (%d lines); env key set for %s", len(lines), name)


def _diagnose_imports() -> None:
    """Log the import chain the OpenAI SDK needs — the distro failure has
    been blocking runs with no visible cause."""
    for mod in ("distro", "httpx", "openai", "jiter"):
        try:
            m = __import__(mod)
            logging.getLogger("balls_runtime").warning("import %s OK (%s)", mod, getattr(m, "__file__", "?"))
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("balls_runtime").warning("import %s FAILED: %r", mod, exc)


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
    _write_soul(home)

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


# --- Local Podule: on-device llama.cpp (in-process ctypes) -----------------
#
# Android SELinux blocks exec of app-data binaries from the app domain
# (subprocess Popen → EACCES even at 0755). The sanctioned path (per the
# decision doc) is in-process hosting: dlopen libllama-server-impl.so and
# call llama_server(argc, argv) on a daemon thread.

LOCAL_LLAMA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "llama")
LOCAL_MODEL_NAME = os.environ.get("BALLS_LOCAL_MODEL_NAME", "qwen3-0.6b")

# Bottom-up dlopen order (bionic resolves DT_NEEDED from already-loaded
# globals; arbitrary dirs are not searched). The CPU backend ships as
# arch-suffixed variants — preload the best one for this device so the
# backend registers (the official stub normally picks it via CPUID).
_CPU_VARIANTS = [
    # S24 firmware SIGILLs on SVE (addvl) — the armv9.x tiers are unusable
    # here. armv8.6_1 (dotprod/i8mm, no SVE) is the safe top tier.
    "libggml-cpu-android_armv8.6_1.so",
    "libggml-cpu-android_armv8.2_2.so",
    "libggml-cpu-android_armv8.2_1.so",
    "libggml-cpu-android_armv8.0_1.so",
]
_LLAMA_SO_ORDER = [
    "libggml-base.so",
    "libggml.so",
    "libllama.so",
    "libmtmd.so",
    "libllama-common.so",
    "libllama-server-impl.so",
]

_llama_lib = None
_llama_thread = None


def _load_llama_libs():
    global _llama_lib
    if _llama_lib is not None:
        return _llama_lib
    import ctypes

    mode = getattr(os, "RTLD_GLOBAL", 0) | getattr(os, "RTLD_NOW", 2)

    # Load base + core ggml first, then register the CPU backend through the
    # registry API (ggml_backend_load takes an absolute PATH — the loader's
    # name-based dlopen can never find app-data files, so go via the path).
    ctypes.CDLL(os.path.join(LOCAL_LLAMA_DIR, "libggml-base.so"), mode=mode)
    ggml = ctypes.CDLL(os.path.join(LOCAL_LLAMA_DIR, "libggml.so"), mode=mode)
    load_backend = ggml.ggml_backend_load
    load_backend.restype = ctypes.c_void_p
    load_backend.argtypes = [ctypes.c_char_p]
    loaded_any = False
    for name in _CPU_VARIANTS:
        path = os.path.join(LOCAL_LLAMA_DIR, name)
        if os.path.isfile(path):
            try:
                reg = load_backend(path.encode())
                loaded_any = reg is not None
                logging.getLogger("balls_runtime").warning("backend load %s -> %s", name, reg)
                if loaded_any:
                    break
            except OSError:
                continue
    if not loaded_any:
        raise RuntimeError("no CPU backend variant could be loaded")
    for name in _LLAMA_SO_ORDER:
        path = os.path.join(LOCAL_LLAMA_DIR, name)
        lib = ctypes.CDLL(path, mode=mode)
        if name == "libllama-server-impl.so":
            _llama_lib = lib
    return _llama_lib


def start_local_model(gguf_path: str, port: int = 8080) -> dict:
    """Host llama-server in-process on loopback (Local Podule)."""
    global _llama_thread
    if _llama_thread is not None and _llama_thread.is_alive():
        return {"ok": True, "already_running": True, "port": port}

    gguf = os.path.expanduser(gguf_path)
    if not os.path.isfile(gguf):
        return {"ok": False, "error": f"local model not found: {gguf}"}

    try:
        lib = _load_llama_libs()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"llama libs failed to load: {exc}"}

    import ctypes

    entry = getattr(lib, "_Z12llama_serveriPPc", None)
    terminate = getattr(lib, "_Z22llama_server_terminatev", None)
    if entry is None:
        return {"ok": False, "error": "llama_server entry not found in libllama-server-impl.so"}
    entry.restype = ctypes.c_int
    entry.argtypes = [ctypes.c_int, ctypes.POINTER(ctypes.POINTER(ctypes.c_char))]
    if terminate is not None:
        terminate.restype = None
        terminate.argtypes = []

    argv = [
        b"llama-server",
        b"--model", gguf.encode(),
        b"--host", b"127.0.0.1",
        b"--port", str(port).encode(),
        b"--ctx-size", b"4096",
        b"--threads", b"4",
        b"--no-warmup",
    ]
    argv_c = (ctypes.c_char_p * len(argv))(*argv)

    def _runner():
        # Capture llama_server's stderr for diagnosis.
        err_path = os.path.join(os.path.expanduser(os.environ.get("HERMES_HOME", "/tmp")), "llama-server.stderr.log")
        try:
            err_fd = os.open(err_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            os.dup2(err_fd, 2)
            os.close(err_fd)
        except OSError:
            pass
        try:
            argv_ptr = ctypes.cast(argv_c, ctypes.POINTER(ctypes.POINTER(ctypes.c_char)))
            result = entry(len(argv), argv_ptr)
            logging.getLogger("balls_runtime").warning("llama_server exited: %s", result)
        except Exception as exc:  # noqa: BLE001
            logging.getLogger("balls_runtime").error("llama_server threw: %s", exc)

    _llama_thread = threading.Thread(target=_runner, name="balls-llama", daemon=True)
    _llama_thread.start()

    # Wait for the OpenAI-compatible health endpoint (up to 60s).
    deadline = time.time() + 60
    last_error = "no response"
    while time.time() < deadline:
        if not _llama_thread.is_alive():
            return {"ok": False, "error": "llama_server exited during startup"}
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
    return {"ok": False, "error": f"llama_server startup timed out: {last_error}"}


def stop_local_model() -> dict:
    """Ask the in-process server to terminate (exported terminate API)."""
    global _llama_thread
    if _llama_lib is not None:
        terminate = getattr(_llama_lib, "_Z22llama_server_terminatev", None)
        if terminate is not None:
            try:
                terminate()
            except Exception:  # noqa: BLE001
                pass
    _llama_thread = None
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
