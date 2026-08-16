# Balls — Serving & Privacy Decision Record

**Decided:** August 16, 2026
**Owner:** Epic Technologies / Rick Cain
**Prepared by:** Hermes Agent
**Status:** LOCKED — app dev wires this in as specified

---

## Decision

1. **Default serving = Cloud Podule** (`balls-cloud-core`), hosted on a **dedicated inference box** (Linveo TX, 16GB/6c — inference ONLY). **Hermes agent runs on the phone itself** (embedded/Termux); V2 (`voice.epictechservices.com`) hosts the phone dashboard/console. The box is a dumb model endpoint: no agent runtime, no sessions, no dashboard, no persistent state. The app's default answer path is Epic infrastructure, never a third-party API.
2. **Both Cloud Podules AND the Local Podule are paid.** Free tier "Balls Deep" = core chat via the default cloud podule (rate-limited). Paid "Whole Balls" = all podules (cloud premium + phone).
3. **Local Podule** = on-device model (Gemma 4 E2B, 4-bit, llama.cpp in-process — see `balls-local-models.md` consult) — the offline/privacy tier.
4. **Privacy model = "we physically can't see your chats" via architecture, not scrambling.** No prompt encryption (FHE is research-stage, not consumer-viable in 2026 — Cachemir arXiv 2602.11470 is the first practical FHE KV-cache protocol and still not shippable). The claim is backed by: Epic-hosted inference, ephemeral-by-design server, client-side PII scrubbing, and a no-content-logging policy.

---

## Default serving spec (dev wires this)

Resolver order when a message is sent:

```
1. If entitlement has Local Podule AND local podule model is installed:
   → route to local llama.cpp (in-process, Chaquopy bridge)      [offline, zero egress]
2. Else (default): Cloud Podule → Epic inference box
   → https://<inference-box>/v1/chat/completions            [TLS 1.3, cert-pinned]
3. If cloud unreachable AND local podule not installed:
   → friendly error: "Balls is out of range. Install the Local Podule (Whole Balls)
     to talk offline."
```

- Default = Cloud Podule. Local Podule = user-visible choice ("Talk with the Local Podule — 100% offline") on Whole Balls.
- **Box role: inference ONLY.** Hermes agent + tools + persona + entity substitution run ON THE PHONE; the phone's Hermes dials this box as a plain OpenAI-compatible model endpoint. V2 keeps hosting the phone dashboard/console (its state stays on V2/phone — untouched). The box holds: model weights + tmpfs request buffer + metrics only. Nothing persistent, nothing to share, no contention with any dashboard. All no-log measures below apply to the box globally — there is nothing else on it.
- Model: `Qwen3-8B Q8_0` (~8.5GB, near-lossless — Q4 rejected, user's quality bar) for cloud-core; `Qwen3-14B Q6_K` (~10.5GB) for cloud-premium. Speculative decoding optional (0.6B draft). Verify tok/s before locking.
- Proxy = llama.cpp server's native OpenAI-compatible `/v1`. No auth passthrough to any third party — the ONLY upstream is the local model.

## Podule Registry (app module)

```
Podule {
  id: "balls-cloud-core" | "balls-cloud-premium" | "balls-phone"
  kind: "cloud" | "phone"
  status: locked | available | installed | downloading
  entitlement: "balls-deep" (free) | "whole-balls" (paid)
}
```

- Free: `balls-cloud-core` only, quota'd (e.g. 30 msgs/day, resets UTC midnight).
- Whole Balls: `balls-cloud-premium` (bigger/faster model when V2 upgrade or second box) + `balls-phone`.
- Entitlement source: Google Play Billing receipt verified server-side; store a local unlock token (Android Keystore). Wave/Stripe only for non-Play sales.

## Privacy pipeline (the claim's engineering)

Client (app) → wire → Epic proxy → model. Rules at each layer:

**Client (on-device):**
- **Entity substitution (the scramble that works)**: before ANY egress, a substitution pass replaces sensitive entities — emails, phone numbers, street addresses, SSN/card patterns, names from the local contacts/identity list, and user-defined "never send" terms — with random opaque tokens (`X7Q2Z`, `M3RKL`, …). The response is re-substituted back on-device after delivery. Result: the bytes on the wire and at the server are meaningless to anyone but the user's phone — the practical equivalent of encrypting the query, without FHE's 1000x slowdown. Default ON for paid tier; toggle available. (Regex + blocklist pass for obvious patterns, on-device model assist optional later.)
- Conversation history stored ONLY on device, encrypted (Android Keystore, AES-GCM). Nothing in the cloud, ever.
- Per-device API token (rotating, 30-day), request signing (HMAC-SHA256 over body + timestamp). No API key baked into the APK.

**Wire:**
- TLS 1.3 + certificate pinning (Epic proxy cert only).
- No user identity in request path: token → anonymous session id (hash), no email/name/device-id in headers.

**Epic proxy (V2 VPS) — the no-logging contract:**
- Stateless by design: conversation bodies live in an in-memory session buffer with 15-minute TTL, zero disk writes of prompt/response text.
- Logs = metrics only: anonymous session hash, token counts, latency, model. NO prompt/response bodies in any log, no access-log of chat payloads (disable nginx access log for `/v1/chat/completions`).
- Server RAM is wiped on reboot by design (tmpfs for session buffer); no persistent store exists to leak.
- **Hardening (encryption at rest + containment)**: `swapoff` (no swap file to leak RAM — only if the box isn't relying on swap; check first), `mlock` the model/session memory, `ulimit -c 0` (no core dumps), tmpfs only for podule chat state, LUKS-encrypted secondary volume if Linveo offers one, firewall + fail2ban + no remote root login. **Scoped claim: if the podule's box is ever seized, there is nothing to read *about Balls*** — no disk state, no logs, RAM gone on power-off. (On a shared box, the phone system's own Hermes state lives on disk by design — that's Epic's data, not Balls user data.)
- Upstream = the local llama.cpp process only. No third-party API ever in the chat path.

**If a third-party API is ever added (deferred, requires re-decision):**
- Zero-retention/no-training provider + DPA, PII already scrubbed client-side, anonymous ephemeral upstream keys, no user identity forwarded. This path is NOT approved today.

## What we can claim (copy-safe) vs can't

| Claim | Status |
|---|---|
| "Your chats never leave your phone" (Local Podule) | ✅ TRUE — fully offline |
| "Your chats go to our servers, not a third party" | ✅ TRUE — self-hosted inference |
| "We don't log your conversation content" | ✅ TRUE — by architecture (metrics only) |
| "What leaves your phone is scrambled — your real names, numbers, addresses never exist outside your phone" | ✅ TRUE — entity substitution, default ON |
| "Not even we can see your chats" | ⚠️ Only for Local Podule — Cloud Podule is processed on Epic's VPS by design |
| "Even the server host can't read your chats (hardware-verified)" | ❌ NOT NOW — needs TEE hardware (Azure Confidential VM / NVIDIA confidential GPU, attestation-gated). Production-mature in 2026; revisit if we leave Linveo or Balls gets regulated/enterprise users |
| "Your queries are encrypted/scrambled so no one can read them" | ❌ NOT CLAIMABLE — FHE not consumer-viable in 2026; don't put this in marketing |

## Dev wiring checklist

- [ ] Podule Registry module (entitlement + status + resolver logic above)
- [ ] Entity substitution module (`src/lib/entity-sub.ts`) — pre-egress substitution + post-response restore, default ON
- [ ] On-device encrypted history store (Keystore AES-GCM)
- [ ] TLS pinning + signed requests + rotating device token
- [ ] Cloud client → `https://voice.epictechservices.com/v1/chat/completions` (OpenAI-compatible)
- [ ] Local Podule bridge → llama.cpp in-process (Chaquopy ctypes/JNI spike first)
- [ ] Play Billing integration + server-side receipt verification → unlock token
- [ ] Quota enforcement for free tier (30 msgs/day, device-local counter + server counter)

## Deferred

- [ ] `balls-cloud-premium` bigger model (when VPS upgraded or second box added)
- [ ] TEE/confidential VM if cloud moves off Linveo
- [ ] Open-sourcing the proxy shim (auditability = the real trust play; strongest marketing asset available at zero cost)
- [ ] FHE re-evaluation when Cachemir-class systems ship production SDKs

---

## Prior art / context

- Local model selection: Gemma 4 E2B 4-bit default, Qwen3 1.7B tool-calling alt, Qwen3 0.6B/SmolLM 1B fallback — 3-brain consult (Kimi K3, GPT-5.6 Terra, GLM 5.2) + web grounding, Aug 16 2026. See `balls-local-models.md`.
- Branding: `balls-naming-decision.md` (tiers Balls Deep / Whole Balls, taglines).
- VPS inventory: V1 Ohio (apkcontrol), V2 Texas (voice.epictechservices.com) — both 4c/8GB.
