# Balls — Pricing Decision Record

**Decided:** August 16, 2026
**Owner:** Epic Technologies / Rick Cain
**Prepared by:** Hermes Agent (deepseek-v4-flash via opencode-go)
**Status:** LOCKED — pricing sheet for app dev wiring. Brain-consult addendum appended when review completes.

---

## Decision

Four tiers, one add-on, universal voice rules. Balls Deep is the top package — everything, one price, no asterisks.

| Tier | Price | Chat | Voice | Notes |
|---|---|---|---|---|
| **Free Balling** (Balls of Steel Mode) | $0 | Local podule only, no egress | — | The hook. Bundled tiny model (Qwen3-0.6B / SmolLM 1B class), slow, chat-only. |
| **Balls Rising** | $9.99/mo | Cloud Podule (self-hosted Qwen3-8B), ~30 msgs/day | — | + chat packs. Proxied DeepSeek = internal overflow fallback only, invisible to users. **Renamed from "Balls Lightning" (2026-08-16, 3/3 brain consult) — "passes through walls" survives as the cloud podule's feature tagline (Cixin Liu Easter egg).** |
| **The Drop** *(decoy tier)* | **$29/mo** | Cloud Podule, higher chat quota | **10 calls/mo** (~260 min allowance; hold half-count), failed calls free, $0.20/min overage | **The decoy.** Name = balls-drop → adulthood idiom ("your balls dropped; now go Deep"). Goldilocks anchor: founder Deep is 99 CENTS more for UNLIMITED — the decoy exists to be destroyed by the founder offer. Beats Rosie on value 7.5x ($0.11/min vs $0.83). **ALL consumer copy uses CALLS, not minutes.** |
| **Balls Deep** | **$49.99/mo** | Everything: full agent, premium 14B model, local podule, no caps, priority routing | **UNLIMITED voice** (fair-use policy: 3,000 talk-min/mo; hold truly unlimited — see FUP below) | THE package. "Have some balls — go Balls Deep." The one-dollar flex: Rosie charges $49 for 250 min; we charge $49.99 for every call — one dollar apart, infinite delta. |
| **Founder-500** | **$29.99/mo forever** | = Balls Deep | = Balls Deep | First 500 customers only. Urgency + evangelists + bounded loss tail. |

**Universal voice rules (all tiers):**
- Failed calls are **free** — hung up on, errored, agent failed → auto-credit, never counts against allowance or packs. AI re-dials on its own dime.
- **Hold time counts half** — while the AI waits on hold it's not spending TTS, so the user's allowance stretches ~2x on hold-heavy calls.
- Voice is always metered separately from pure-chat tiers (subscriptions never subsidize call costs).

---

## Fair Use Policy — UNLIMITED voice (locked 2026-08-16)

**Balls Deep includes UNLIMITED voice.** The meter is gone; the marketing promise is real. The following published Fair Use Policy bounds the tail (industry-standard practice — every "unlimited" phone/data plan has one):

> **⚠️ PUBLIC-POSITION RULE (locked 2026-08-16):** the 3,000-min threshold is **INTERNAL OPS ONLY — never published.** Public copy says "generous fair-use allowance, calibrated to be invisible to 99%+ of users" + the proportionality clause. Publishing the number invites "3,000 minutes isn't unlimited" attacks and threshold-gaming. Site scrubbed 2026-08-16 (0 occurrences).

| Rule | Value | Rationale |
|---|---|---|
| **Fair-use threshold** | **3,000 agent-talk min/mo** (~50 hrs), monthly reset | Invisible to 99%+ of users; calibrated to the owner's own usage (~2,100 min/mo) + 40% headroom. "Fair use is where the owner lives." |
| **Proportionality trigger** | **Discretionary: usage materially disproportionate to the broader user base** (e.g., one user consuming far beyond the next-heaviest) → throttle/limit | "Fair use" means *reasonable*, not absolute — the published 3,000-min number is the promise's floor; the relative trigger is the real enforcement. Standard carrier practice. Published wording: "Fair use = reasonable, non-commercial use; usage materially exceeding typical user patterns may be throttled." |
| **Hold time** | **Truly unlimited, unmetered** | Costs ~$0.07/min; the killer differentiator — "Balls holds for you, always." |
| **Past threshold** | Throttled + notice, **never billed** | Predictable, non-punitive; preserves goodwill |
| **Concurrent calls** | Max 2 | Abuse control without touching legit usage |
| **Bot-loop detector** | Same phrase repeated >5× → auto-terminate | Prevents recursive loops / runaway agents |
| **Commercial-use restriction** | Pattern-based detection (spam/telemarketing farms) → throttle or terminate | Protects the margin of the 95% |
| **Legal copy** | "Unlimited use is subject to our Fair Use Policy for agent-driven activity (threshold: 3,000 min/mo). See [link]." | Survives FTC / EU consumer-law scrutiny |

**Brain consult #2 (all four, 2026-08-16):** kimi 180 / terra 800 / glm 1,000 / deepresearch 3,000 min/mo. Adopted Deep Research's 3,000 — the only threshold that clears the founder's own usage. Consult outputs: `.tmp/brain-unlimited-*.txt`.

---

## Why these numbers

### Cost stack (quality voice, per wall-minute)
| Component | Cost/min |
|---|---|
| Deepgram Voice Agent (BYOP platform + STT) | $0.065 |
| ElevenLabs TTS (only while agent speaks) | ~$0.033–0.048 |
| Self-hosted LLM (opencode-go / Epic box) | ~$0.005 |
| SIP trunk | ~$0.008 |
| **Active talk** | **~$0.115–0.17** (speech-ratio dependent — MEASURE IN BETA) |
| **Hold** | **~$0.07** (no TTS spend) |

Deepgram BYOP $0.065/min verified via Deepgram docs + their Ask AI widget (2026-08-16): the rate exists precisely *because* Deepgram is not providing TTS; ElevenLabs bills separately on the customer's own account. Two bills, always.

### Margin model (usage skew does the work)
Blended subscriber distribution: ~40% near-inactive, 35% light (~10 min/mo), 15% medium (~30 min), 10% heavy (120+ min).

| Plan | Typical cost | Margin |
|---|---|---|
| Lightning $9.99 | ~$0.50 (box amortized) | ~95% |
| The Drop $29 (typical 10–25 min) | $1.15–2.90 | **90-96%** |
| The Drop full 260 min | $6.90 (realistic) / $10.20 (worst) | 65-76% |
| Deep $49.99 blended | ~$6.80 | **~86%** |
| Deep unlimited worst-case per user (at FUP edge, 3,000 talk-min) | ~$345 | **-760%** — accepted, bounded: only commercial farms reach it, terminated under commercial-use clause |
| Realistic top-1% power user (500-1,500 min/mo) | $57-170 | negative — the price of the founder's own usage pattern; subsidized by the skew, as designed |
| Deep founder $29.99 blended | ~$6.80 | ~77% |

**The Fair Use Policy is the insurance:** the unlimited promise is bounded by the 3,000-min talk threshold + commercial-use termination + bot-loop detection. Legit humans never hit it; farms get killed; the tail is known and manageable.

### Funnel mechanics ("man up" — revised 2026-08-16)
- **The 99-cent gap** ($29 Drop vs $29.99 founder Deep) stays as the **acquisition headline only** — it makes the founder offer look insane to NEW customers.
- **The Drop is a profit island, not a conversion bridge:** it's cost-capped (10 calls), and converting Drop users to founder Deep is margin-destructive (+$0.99 revenue, -$20/mo margin on heavy users, loses the overage stream). **NEVER promote founder pricing to existing Drop users.**
- **The wall** ("You've used your Drop calls.") offers: (1) top-up buckets ($10/60min — margin), (2) standard Deep $49.99 (86% margin), (3) wait for reset. No founder price in-app.
- **Founder-500 = acquisition-only** (landing page, ads, waitlist — new customers). Seats are for conquest, not conversion.
- The ladder is a **shame funnel** (locked direction): names shame by position, the gap shames by logic, the wall shames at the moment of truth. **Shame the tier, never the person.** Lines: "Upgrade to Deep. Stop being a Drop." / "Your Drop calls are gone. Your balls don't have to be."
- Rising → The Drop is the voice entry ramp; The Drop → Deep is the "grow up" step.

### Positioning
- Never frame against Rosie/Goodcall — frame against the **human secretary**: "$300/mo for a secretary who sleeps. $34.99 for one who doesn't." Price is the punchline of a better product, not a discount.
- Lead with the promise, price last. Tell the economics story: "We charge what it costs, not what the market will bear."
- Price at the **top of the consumer zone (~$40)** — average users are $20-anchor buyers (ChatGPT Plus), not SMB $300 buyers. Above ~$50 we leave the consumer zone and become "another Rosie."
- Capability stack anchors: assistant $20 + secretary $49 = $69 stack, sold at $39.99 (42% under), ~7.5x under Smith.ai $300.

---

## Open items (beta)

1. **Measure the real speech ratio** (agent talk time per wall-minute) — determines true unlimited-tail cost. 2 weeks of beta logs.
2. Founder-500 mechanics: signup flow, counter widget, referral nudge.
3. ElevenLabs volume tier at 1k+ subscribers (~$0.095 → ~$0.07/min) — margin only grows.
4. Podule-on-Free: **resolved — rejected** (3 of 4 brains against; funnel discipline).
5. FUP instrumentation: per-user talk-vs-hold metering, threshold alerts at 75/90/100%, farm-detection patterns, founder-account exemption flag.

---

## Brain consult (addendum — 2026-08-16)

Kimi K3, GPT-5.6 Terra, GLM 5.2, and Perplexity Deep Research reviewed the full feature set and this sheet.

**Adopted (unanimous or majority consensus):**
- **Annual pricing**: Balls Deep $499/yr (2 months free, ~$41.58/mo effective — founder $29.99 stays the headline deal).
- **14-day full-feature trial** — prove quality before price matters; auto-downgrade on non-conversion.
- **Top-up bucket** replaces raw per-minute anxiety: **$10 = 60 voice min** ($0.167/min), hold half-count applies. Per-minute $0.20 remains available.
- **Monthly voice spend ceiling** (fairness cap): The Drop $40/mo, Deep $60/mo — auto-stop + "go Deep" nudge at cap. No bill shock ever.
- **Extra seat** on Deep: +$19.99/mo (partner/family).
- **Positioning headline** (Deep Research): *"The only private agent that handles real-world phone calls."* Shatter for attention, charge market-or-below.

**Rejected:**
- Kimi's premium push (Deep $49.99-54.99, Lightning/Podule $12.99) — conflicts with the "shatter the market for attention, charge market or below" strategy.
- Deep Research's tier-merge (kill Lightning chat-only tier) — podule + "man up" funnel is the conversion engine.
- Phone Podule on Free tier (3 of 4 against) — Lightning-only keeps funnel discipline.

**Strategy statement (user, locked):** *"Shatter the market for attention, but charge market or below."* Attention comes from price aggression + brand; margin comes from structure (annual, seats, skew), not from premium pricing.
