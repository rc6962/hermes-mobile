"""balls_llama — on-device llama.cpp Local Podule launcher (spike).

Spawns the vendored llama-server (src/main/python/llama/llama-server, an
OpenAI-compatible HTTP server) as a subprocess on 127.0.0.1:<port> and
returns the provider JSON fragment the embedded Hermes consumes via
balls_runtime.start_runtime(provider_json=...).

Vendored layout (see scripts/vendor-llama.py):
    python/llama/llama-server            <- 7 KB ELF stub
    python/llama/libllama-server-impl.so <- server implementation (dlopened)
    python/llama/libllama.so, libllama-common.so, libggml*.so,
    libggml-cpu-android_armv*_N.so       <- CPU backend variants (dlopened)
The Android binaries carry no DT_RUNPATH, so LD_LIBRARY_PATH must point
at the llama/ dir before exec (bionic honors it for app-spawned child
processes). The GGUF is downloaded at onboarding to the app's private
files dir and passed in as model_path; it is never part of the APK.

Provider JSON shape (Hermes v12 config, hermes_cli/runtime_provider.py
_get_named_custom_provider + hermes_cli/config.py provider normalizer):
    {"providers": {"local": {
        "provider": "openai",                      # accepted silently
        "base_url": "http://127.0.0.1:<port>/v1",  # must be valid URL
        "api_key": "<key>",                        # inline key (no key_env)
        "default_model": "<model id from /v1/models>",
    }}}
The model id is auto-detected from llama-server's /v1/models (single
loaded model) — the same probe Hermes' _auto_detect_local_model uses.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

_LOG = logging.getLogger("balls_llama")

DEFAULT_PORT = 18080
DEFAULT_HOST = "127.0.0.1"
DEFAULT_CTX = 4096
HEALTH_TIMEOUT_S = 180.0
_LLAMA_DIR = Path(__file__).resolve().parent / "llama"


def _binary() -> str | None:
    """Vendored binary first; system llama-server (PC dev) as fallback."""
    override = os.environ.get("BALLS_LLAMA_BIN")
    if override:
        return override
    candidate = _LLAMA_DIR / "llama-server"
    if candidate.exists():
        return str(candidate)
    return shutil.which("llama-server")


def _env_for(llama_dir: Path, model_path: Path) -> dict:
    env = dict(os.environ)
    if llama_dir.exists():
        # bionic needs this; harmless on PC.
        env["LD_LIBRARY_PATH"] = str(llama_dir)
    # Android has no /tmp; give llama-server a writable scratch dir.
    scratch = model_path.parent / ".llama-tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    env["TMPDIR"] = str(scratch)
    return env


def _model_id_from_gguf(path: Path) -> str:
    """Fallback model id: filename stem (auto-detect via /v1/models wins)."""
    return path.stem


def _detect_model_id(base_url: str, fallback: str) -> str:
    try:
        with urllib.request.urlopen(f"{base_url}/models", timeout=5) as resp:
            data = json.loads(resp.read())
        models = data.get("data", [])
        if len(models) == 1 and models[0].get("id"):
            mid = models[0]["id"]
            # Some GGUFs carry no name metadata; llama-server then reports the
            # file path as the id. Prefer a clean name for the provider config.
            if "/" not in mid and "\\" not in mid:
                return mid
    except Exception as exc:  # noqa: BLE001
        _LOG.debug("model id detection failed: %s", exc)
    return fallback


def start(
    model_path: str,
    port: int = DEFAULT_PORT,
    ctx: int = DEFAULT_CTX,
    threads: int | None = None,
    api_key: str = "local",
    kv_cache_q8: bool = True,
    reasoning_budget: int = 256,
    extra_args: list[str] | None = None,
) -> dict:
    """Start llama-server on loopback. Returns status dict incl. provider_json.

    Gemma 4 E2B is a thinking model: it emits CoT into the
    ``reasoning_content`` channel and can burn the whole max_tokens budget
    on reasoning (PC test: 1495 CoT chars for a 60-word answer). Cap it with
    --reasoning-budget or answers come back empty at ~10 tok/s. 0 = end
    thinking immediately; -1 = unrestricted.
    """
    model = Path(model_path)
    if not model.exists():
        return {"ok": False, "error": f"model not found: {model_path}"}
    binary = _binary()
    if binary is None:
        return {"ok": False, "error": "llama-server not found (vendored dir missing)"}

    if threads is None:
        threads = max(1, (os.cpu_count() or 4) - 1)

    cmd = [
        binary,
        "-m", str(model),
        "--host", DEFAULT_HOST,
        "--port", str(port),
        "-c", str(ctx),
        "-t", str(threads),
        "--parallel", "1",
        "--api-key", api_key,
        "--no-webui",
    ]
    if kv_cache_q8:  # halve KV cache RAM (weights dominate anyway)
        cmd += ["--cache-type-k", "q8_0", "--cache-type-v", "q8_0"]
    if reasoning_budget != -1:
        cmd += ["--reasoning-budget", str(reasoning_budget)]
    if extra_args:
        cmd += extra_args

    log_path = model.parent / f"llama-server-{port}.log"
    log_fh = open(log_path, "ab", buffering=0)  # noqa: SIM115 — keep handle for child lifetime

    _LOG.info("spawning: %s", " ".join(cmd))
    try:
        proc = subprocess.Popen(
            cmd,
            env=_env_for(_LLAMA_DIR, model),
            stdout=log_fh,
            stderr=log_fh,
            stdin=subprocess.DEVNULL,
        )
    except Exception as exc:  # noqa: BLE001
        log_fh.close()
        return {"ok": False, "error": f"spawn failed: {exc}", "log": str(log_path)}

    base_url = f"http://{DEFAULT_HOST}:{port}/v1"
    deadline = time.monotonic() + HEALTH_TIMEOUT_S
    last_error = None
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            log_fh.close()
            return {
                "ok": False,
                "error": f"llama-server exited rc={proc.returncode}",
                "log": str(log_path),
            }
        try:
            with urllib.request.urlopen(
                f"http://{DEFAULT_HOST}:{port}/health", timeout=2
            ) as resp:
                if resp.status == 200:
                    break
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(0.5)
    else:
        proc.terminate()
        log_fh.close()
        return {
            "ok": False,
            "error": f"health timeout: {last_error}",
            "log": str(log_path),
        }

    model_id = _detect_model_id(base_url, _model_id_from_gguf(model))
    provider_json = {
        "providers": {
            "local": {
                "provider": "openai",
                "base_url": base_url,
                "api_key": api_key,
                "default_model": model_id,
            }
        }
    }
    return {
        "ok": True,
        "port": port,
        "pid": proc.pid,
        "model": model_id,
        "base_url": base_url,
        "log": str(log_path),
        "provider_json": provider_json,
    }


def stop(pid: int | None) -> dict:
    """Best-effort stop of a started llama-server."""
    if not pid:
        return {"ok": True, "stopped": False}
    try:
        subprocess.run(["kill", str(pid)], check=False)  # noqa: S603
        return {"ok": True, "stopped": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def status(port: int = DEFAULT_PORT) -> dict:
    try:
        with urllib.request.urlopen(
            f"http://{DEFAULT_HOST}:{port}/health", timeout=2
        ) as resp:
            return {"ok": True, "running": resp.status == 200}
    except Exception:  # noqa: BLE001
        return {"ok": True, "running": False}


if __name__ == "__main__":
    # Smoke: python balls_llama.py --model <path.gguf> [--port N] [--ctx N]
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--ctx", type=int, default=DEFAULT_CTX)
    parser.add_argument("--threads", type=int, default=None)
    parser.add_argument("--api-key", default="local")
    parser.add_argument("--reasoning-budget", type=int, default=256)
    args = parser.parse_args()

    result = start(
        args.model, args.port, args.ctx, args.threads, args.api_key,
        reasoning_budget=args.reasoning_budget,
    )
    print(json.dumps(result, indent=2))
    if not result.get("ok"):
        sys.exit(1)
    print("serving on", result["base_url"], "— Ctrl+C to stop", file=sys.stderr)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        stop(result.get("pid"))
