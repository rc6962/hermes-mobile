# Balls — Local Model Consult (on-device for the majority of phones)

**Date:** August 16, 2026 — multi-brain consult (Kimi K3, GPT-5.6 Terra, GLM 5.2 thinking) + web grounding. Sonnet 5 refused with a factually-wrong short answer (recorded dissent; not retried).

## Constraint profile ("majority of phones")

4–8GB RAM (6GB mid-point), Android 10+, mixed chipsets (SD 6/7 series, Dimensity, Exynos). Assume **no NPU, CPU + best-effort Vulkan/OpenCL**. RAM budget: weights + KV cache + runtime ≤ 2.5–3GB on 6GB phones; ≤ 1.5GB on 4GB phones.

## Locked picks

| Role | Pick | Weights | Total RAM |
|---|---|---|---|
| **Local Podule (default)** | Gemma 4 E2B, 4-bit GGUF (Q4_K_M) | **3.11 GB** (verified 2026-08-16; earlier 1.0–1.5 GB estimate was wrong — E2B is ~4.7B params, BF16 = 9.31 GB) | ~3.6–4.2 GB with 4k ctx q8_0 KV — fits S24 (12 GB); busts the 4–6 GB phone budget → Q3_K_M (2.54 GB) / UD-IQ3_XXS (2.37 GB) / UD-IQ2_M (2.29 GB) fallbacks |
| Tool-calling alt | Qwen3 1.7B, 4-bit GGUF | ~0.7–0.9GB | ~1.8–2.4GB |
| Low-RAM fallback (4GB phones) | Qwen3 0.6B / SmolLM ~1B, 4-bit | ~0.3–0.7GB | ~0.7–1.5GB |

## Engine

**llama.cpp (GGUF)** — unanimous 3/3. **Spike DONE 2026-08-16** — integration shape locked: **vendored `llama-server` subprocess** (not ctypes/libllama):

- **Artifacts**: `llama-b10451-bin-android-arm64.tar.gz` (77.8 MB) from https://github.com/ggml-org/llama.cpp/releases — release **b10451** (2026-08-16), sha256 `2b08c2a0…482a9d`. Min Android 28 (r29 NDK build), CPU-only, no Vulkan in official android asset.
- **Vendoring**: `mobile/android/scripts/vendor-llama.py` → `src/main/python/llama/` (16 files: `llama-server` 7 KB ELF stub + `libllama-server-impl.so` + `libllama.so`/`libllama-common.so`/`libggml*.so`/`libmtmd.so` + 8 `libggml-cpu-android_armv*` variants). **27.9 MB after NDK `llvm-strip --strip-all`** (raw subset 257 MB — official artifacts ship debug_info). No DT_RUNPATH → `LD_LIBRARY_PATH=<llama dir>` must be set before exec (bionic honors it for app-spawned children; Termux-proven pattern).
- **Launcher**: `src/main/python/balls_llama.py` — `start(model_path, port=18080, ctx=4096, threads=None, reasoning_budget=256)` spawns llama-server on 127.0.0.1, polls `/health`, returns `{ok, port, pid, model, base_url, log, provider_json}`. Flags: `--cache-type-k/v q8_0` (halve KV RAM), `--parallel 1`, `--no-webui`, `--api-key`.
- **Provider JSON** (Hermes v12 shape, consumed by `balls_runtime.start_runtime(provider_json=…)` → `cli-config.yaml`; resolver `hermes_cli/runtime_provider.py::_get_named_custom_provider`):
  ```json
  {"providers": {"local": {
      "provider": "openai",
      "base_url": "http://127.0.0.1:18080/v1",
      "api_key": "local",
      "default_model": "gemma-4-E2B-it-Q4_K_M"
  }}}
  ```
  `default_model` auto-detected from `/v1/models` (falls back to GGUF filename stem; llama-server reports the file path as id when the GGUF lacks name metadata).
- **⚠ Gemma 4 E2B is a thinking model**: emits CoT into `reasoning_content` — PC test burned **1495 chars of CoT for a 60-word answer** (empty `content` when max_tokens runs out). On-device MUST run `--reasoning-budget 256` (verified: caps CoT, answer then streams; 0 = skip thinking, -1 = unlimited).
- **PC benchmark (b10451 win-cpu-x64, 8 threads, desktop)**: **9.6–10.1 tok/s eval**, ~27 tok/s prompt. SD 8 Gen 3 (S24) expected 10–15 tok/s CPU. Within the 8–15 target band.

## Model artifact (verified 2026-08-16)

- **Repo**: `unsloth/gemma-4-E2B-it-GGUF` (HF; base `google/gemma-4-E2B-it`, Apache-2.0; official `ggml-org/gemma-4-E2B-it-GGUF` has only Q4_0/Q8_0/BF16).
- **Default**: `gemma-4-E2B-it-Q4_K_M.gguf` — **3,106,738,272 B (3.11 GB / 2.89 GiB)**, sha256 `740185b2…34ec34b8`.
- Alternatives: Q3_K_M 2.54 GB · UD-IQ3_XXS 2.37 GB · UD-IQ2_M 2.29 GB · IQ4_XS 2.98 GB (all same repo). `mmproj-*.gguf` (0.99 GB) only if vision is ever needed.
- **Onboarding download (NOT in APK)**: Kotlin downloads GGUF → `filesDir/models/gemma-4-E2B-it-Q4_K_M.gguf` with resume support (`Range`/`-C -`), sha256 verify, ~3.2 GB free-space check, wifi-only prompt, then calls `balls_llama.start(model_path, …)`. 3.1 GB @ ~10 MB/s ≈ 5 min.

## Speed reality (mid-range)

8–15 tok/s CPU, ~12–30 tok/s Vulkan for 3–4B Q4. Brains claimed 200–800 tok/s — desktop numbers, rejected. UX must compensate: streaming, thinking indicator, persona preloaded in KV cache.

## Tool calling (ranked by brains)

Gemma 4 E2B/E4B and Qwen3 1.7B = top-2, consistently. Llama 3.2 3B ranged #1 (Kimi) → #4 (GLM). ≤1B models unreliable for multi-step schemas.

## Persona

1–2B drifts on long sessions; 3–4B holds. Mitigation: strong system prompt + hybrid routing (not fine-tunes, solo-dev cost).

## Architecture (locked, 3/3)

Local-first hybrid: local model for persona/chat/private, cloud for hard tasks, cloud optional/opt-in. Fully-offline = premium signal. → Implemented as the Podule system, see `balls-serving-privacy-decision.md`.

## Candidate table (grounded 2026)

| Model | Quant | Weights | RAM | Tier |
|---|---|---|---|---|
| Gemma 4 E4B | 4-bit | ~1.5–2.2GB | ~2.5–3.2GB | small–mid |
| Llama 3.2 3B | 4-bit | ~1.2–1.6GB | ~2.0–3.0GB | workhorse, 6GB+ |
| Phi-4 Mini (3.8B) | 4-bit | ~1.5–1.8GB | ~2.5–3.0GB | "smartest mobile LLM" (Jul 2026) |
| Gemma 3n E2B | 4-bit | ~0.5–0.6GB | ~1.0–1.4GB | tiny, 1.5× faster than Gemma 3 4B |
| LFM2 1.2B | 4-bit | ~0.6–0.8GB | ~1.2–1.6GB | tiny |
