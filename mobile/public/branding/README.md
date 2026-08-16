# Balls — Brand Assets

Source of truth: `D:\Hermes\balls-branding\` (canonical). This folder is the app-facing copy (served at `/branding/...` in the app).

## Files

| File | Use | Where |
|---|---|---|
| `balls-icon.svg` | **The app icon.** Sly cat-eye sphere, blue/silver chrome, transparent bg | Launcher icon source, splash, avatar, favicon |
| `balls-lockup.svg` | Icon + BALLS wordmark + subline (static) | Store listing, website header, invoices, docs |
| `balls-lockup-animated.svg` | Same lockup, pure-SVG animation: entrance → wink → sheen sweep + breathing + glow pulse | Splash screen, website hero, loading states |
| `balls-pair.svg` | **EASTER EGG — never the app icon** (Play Store sexual-content policy). Big sly ball + smaller winking ball | Stickers, merch, footer hover, April Fools, "Out of Balls" error screen |
| `balls-pair-animated.svg` | Pair with drop-in bounce + squash + prominent looping wink | Same homes, animated |
| `preview.png` | Full preview sheet (render of `preview.html` in `D:\Hermes\balls-branding\`) | Design review |

## Brand rules

- **Palette (blue/silver chrome, NO purple):** white `#ffffff` → silver `#e2e8f0` → light blue `#93c5fd` → steel `#2563eb` → deep navy `#1e40af` → near-black `#0f172a`. Accent electric blue `#38bdf8`. Eye rims: silver-steel `#cbd5e1` (left) / electric blue `#38bdf8` (right).
- **One face, one identity:** the sly cat-eye sphere is THE personality everywhere. The pair's right ball winks; the icon never does.
- **Easter egg rule:** the pair must be hidden behind an unlock/toggle — never in store-facing surfaces.
- Animation is pure SVG (SMIL) — plays in any browser, no JS. For app use, prefer Lottie/webm exports (see `balls-inference-endpoint` skill for build context).

## Persona notes

- Taglines: "Balls: have some." / "Balls in your pocket."
- Error messages: "Balls Overflow Error", "Out of Balls", "That's outside the Balls", "Balls Deep" (free tier), "Whole Balls" (paid tier).
- Company line: "AN EPIC TECHNOLOGIES PRODUCT" (already in the lockup).

## Rebuild / iterate

Canonical files + full pitfalls live in the `balls-inference-endpoint` skill context and `D:\Hermes\balls-branding\`. Edits are one-line gradient/stroke changes — keep the SVGs hand-authored (no generator artifacts, clean B guaranteed).
