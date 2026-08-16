# Balls — Local Model Consult (on-device for the majority of phones)

**Date:** August 16, 2026 — multi-brain consult (Kimi K3, GPT-5.6 Terra, GLM 5.2 thinking) + web grounding. Sonnet 5 refused with a factually-wrong short answer (recorded dissent; not retried).

## Constraint profile ("majority of phones")

4–8GB RAM (6GB mid-point), Android 10+, mixed chipsets (SD 6/7 series, Dimensity, Exynos). Assume **no NPU, CPU + best-effort Vulkan/OpenCL**. RAM budget: weights + KV cache + runtime ≤ 2.5–3GB on 6GB phones; ≤ 1.5GB on 4GB phones.

## Locked picks

| Role | Pick | Weights | Total RAM |
|---|---|---|---|
| **Local Podule (default)** | Gemma 4 E2B, 4-bit GGUF | ~1.0–1.5GB | ~2.0–2.9GB |
| Tool-calling alt | Qwen3 1.7B, 4-bit GGUF | ~0.7–0.9GB | ~1.8–2.4GB |
| Low-RAM fallback (4GB phones) | Qwen3 0.6B / SmolLM ~1B, 4-bit | ~0.3–0.7GB | ~0.7–1.5GB |

## Engine

**llama.cpp (GGUF)** — unanimous 3/3. In-process via Chaquopy bridge (ctypes/JNI spike required). Not LiteRT-LM (Gemma-4-only formats), not MLC (chat-only SDK on Android).

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
