# Balls — Naming Decision Record

**Decided:** August 12, 2026  
**Owner:** Epic Technologies / Rick Cain  
**Prepared by:** Hermes Agent (minimax-m2.5 via opencode-go)

---

## Decision

The Android AI chat app will be named **Balls**.

- **App name:** Balls
- **AI assistant name:** Balls (the app is named Balls; the assistant IS Balls)
- **Product modules:** Podules
- **Company:** Epic Technologies ("Balls, an Epic Technologies product")
- **Public positioning:** Bold, private, modular AI. Podules are what you pay for.
- **Private meaning:** An inside nickname Rick and his cousin use for each other.

---

## Brand Strategy

**Taglines:**
- "Balls: have some." (balls = courage/confidence)
- "Balls in your pocket." (private AI, always with you)
- "Balls. Bold. Built different."

**Error messages:**
- "Balls Overflow Error"
- "Out of Balls"
- "That's outside the Balls"
- "Balls Deep" (top tier name)

**Tiers (locked 2026-08-16):**
- **Free — "Free Balling"**: restricted to **Balls of Steel Mode** — local-only tiny model (Qwen3-0.6B / SmolLM 1B class, bundled), slow, chat-only, no phone, zero cloud.
- **Mid — "Balls Lightning"**: Cloud Podule = our inference on Epic hardware (standard model now; fast once GPU dedi lands). Proxied DeepSeek route = internal overflow fallback only, not a tier. Quota'd ~30 msgs/day. Tagline: *"passes through walls."* (Named for the atmospheric phenomenon — rare, fast, vanishes; Cixin Liu novel of the same name.)
- **Top — "Balls Deep"**: **Phone Podule** (full on-device model — fast, private, offline) + cloud + everything. The only tier delivering the complete brand promise (fast AND private AND offline).
- **"Whole Balls"** = superseded paid-umbrella name; optional annual-bundle name if needed later.

**Icon direction:** Solid orb/sphere — confident, geometric, zero ambiguity. Make it feel like a ball, not a joke.

---

## Domain Status

| Domain | Status | Action |
|--------|--------|--------|
| `balls.app` | For sale on Spaceship — $29,999 asking | Buy later for ~$5-10K via offer, or skip |
| `balls.ai` | Taken by Jian Tam (NYC) since 2021, expires 2027 | Approach when brand is established |
| `balls.com` | Squatting — empty | Irrelevant |
| `balls.io` | GoDaddy CashParking | Irrelevant |
| `balls.co` | Edward Ventures — body groomer brand | Irrelevant — different industry |

**Recommended play:** Build the brand first. Once Balls has traction, approach Jian Tam about `balls.ai` with an offer. Or buy `balls.app` when you find it at a reasonable price.

---

## Trademark Clearance

**No Class 9 (software) or Class 42 (SaaS) BALLS trademark found.**

Known BALLS trademarks:
- **Edward Ventures International LLC** — Serial 97304309 — Body grooming razors/tools (Classes 8, 21). **Zero conflict** with software.
- **Squid Ventures Limited** — Serial 018180881 — EU trademark. Different jurisdiction.
- **Various** — "8 BALL," "BALLS OF STEEL," "TUFF BALLS" — all in unrelated goods.

**Recommendation:** File Intent-to-Use (ITU) application for "Balls" in Classes 9 and 42 before launch. Engage trademark attorney.

---

## App Store Status

| Store | "Balls" collision? | Notes |
|-------|--------------------|-------|
| Google Play | Yes, but all are **games** | Ballz, Going Balls, Balls Control, etc. No AI apps. Clear for AI. |
| Apple App Store | Yes — id303046432 | A music app called "Balls." No AI collision. |

**Conclusion:** App Store name "Balls" is wide open for an AI chat app.

---

## App ID / Package ID

Current: `com.rickcain.hermesmobile`  
Target: `com.rickcain.balls`

Changes required:
1. `mobile/capacitor.config.ts` — `appId` and `appName`
2. `mobile/android/app/src/main/res/values/strings.xml` — `app_name`, `package_name`
3. `mobile/index.html` — `<title>`
4. `mobile/package.json` — `name` field
5. Gradle files if appId is referenced there
6. Then: `npx cap sync android && cd android && ./gradlew assembleDebug`

---

## Files to Change for Branding

```
mobile/capacitor.config.ts          — appId, appName
mobile/android/.../strings.xml       — app_name, package_name, custom_url_scheme
mobile/index.html                   — <title>, theme-color
mobile/src/                         — any hardcoded "Hermes" references in UI
mobile/android/.../AndroidManifest.xml — label references
```

---

## Deferred

- [ ] Register `balls.app` domain (when price is right)
- [ ] Approach Jian Tam about `balls.ai`
- [ ] File ITU trademark "Balls" in Classes 9 + 42
- [ ] Check USPTO TSDR for old Podly registration (SN 97216879) — informational only
- [ ] APK build under new branding

---

## Prior Art (what we considered)

The following names were researched and rejected:
- **Podly** — US SN 97216879 is REGISTERED to Podly LLC (Class 42, 2/14/2023). App Store has 2 Podly apps. NO-GO.
- **PodAI** — HIGH RISK. Eight Sleep Pod AI, callpod.ai (~$440K ARR), Brain Pod AI all active. CONDITIONAL at best.
- **Podule** — GO legally, but less memorable/funny than Balls.
- **Ricochet, Boba, Pip, Cricket, Calyx, Acorn** — all legally cleaner but less personally meaningful.

Balls wins on personality, memorability, and personal ownership. It's the name Rick is willing to own.
