# Design System — Daily Spark

→ [CLAUDE.md](../CLAUDE.md)

Do not use Claude's default purples/ambers. Every color must come from this palette.

## Colors

| Role | Value |
|------|-------|
| Primary (green) | `#2D6A4F` |
| Accent (mint) | `#40916C` |
| Secondary (orange) | `#FF9F1C` — quick wins only |
| Background | `#EEF2EE` |
| Surface (card) | `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(1.6)` |
| Surface (solid) | `#FFFFFF` — inputs, inline edit fields |
| Text | `#1B4332` |
| Text muted | `#6C757D` |

**Semantic ring/section tokens** (same token used on ring, row bg, badge, button):

| Token | Value | Used for |
|-------|-------|----------|
| `--ring-distraction` | `#F4A0A0` | Distractions ring + row badges |
| `--ring-distraction-light` | `#fef2f2` | Distraction row backgrounds |
| `--ring-quick` | `#FF9F1C` | Quick wins ring + hours badge |
| `--ring-quick-light` | `#fff5e6` | Quick wins badge background |

## Depth & Glass System

**Background:** `#EEF2EE` base + three blob divs inside a fixed `.blob-layer` container. Blobs use `radial-gradient` + a **static** `filter: blur(60px)`. No `background-attachment: fixed`.

Motion is split across two nested elements so drift and swirl never contend for `transform` — and so the expensive blur is rasterized once instead of every frame:

| Element | Owns | Notes |
|---|---|---|
| `.blob-layer` | visibility | Fixed, full-viewport. Single switch — hidden via `html.focus-fullscreen-open` |
| `.blob-drift` | JS drift `transform` | Zero-size, never painted. `_driftTick` writes `translate3d()` here |
| `.blob` | CSS swirl `transform` + `opacity` | The painted blob; static blur, resting `opacity: 0.88` |

**Performance rules (do not regress):**
- Never animate `left`/`top`/`filter` on a blob — only `transform` and `opacity` are compositor-only. Animating the blur re-rasterizes three half-viewport gaussian blurs per frame.
- The drift loop runs at ~24fps (`DRIFT_FPS`) and pauses on `document.hidden`, during focus fullscreen, and under `prefers-reduced-motion`.
- Swirl keyframes express their "brighten" beat with `opacity` (0.88 → 1), replacing the old `filter: brightness()`.
- Don't add `will-change` to the other `backdrop-filter` elements — layer promotion is deliberately limited to the blobs.

**Cards (`.card`):**
- `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(1.6)`
- Asymmetric border: white top/left, dark bottom/right — simulates top-left light
- Three-layer shadow: contact + diffuse + colored glow + `inset 0 1px 0` highlight
- Hover: `translateY(-2px)`

**Task rows / backlog items / journal entries:**
- `rgba(255,255,255,0.82)` — more opaque so they read as floating inside cards
- Never fully transparent — double-blur looks muddy

**Card backgrounds by type:**
- Most cards: frosted glass `rgba(255,255,255,0.72)`
- Today's Progress: `linear-gradient(160deg, rgba(232,232,232,0.75), rgba(255,255,255,0.65))`
- Encouragement: `linear-gradient(135deg, #2D6A4F, #40916C)` — solid, white text

## Buttons — Liquid Glass Pattern

```css
background:
  linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.1) 100%),
  <base-color>;
```

| Variant | Base | Used for |
|---------|------|----------|
| `.btn-primary` | `#4a8c6e` | Add goal, start day, enable notifications |
| `.btn-secondary-orange` | `#c87d20` | Quick wins actions |
| `.btn-distraction` | `#a85058` | Add distraction |
| `.btn-ghost` | `rgba(140,148,156,0.25)` | Start fresh, Maybe Later |

- Add buttons: icon-only, 42×42px
- Hover: `translateY(-1px)`, shadow deepens
- Active: `translateY(1px)`, shadow compresses
- Small pills (promote, demote, expand): `rgba(150,155,160,0.18)` + blur, 20px radius
- Delete (`.task-delete`): fades in on row hover, red tint on hover

## Glass Text

Used on app title and clock only. Requires `font-weight: 800`.

```css
background: linear-gradient(160deg, rgba(27,67,50,0.9), rgba(45,106,79,0.65), rgba(64,145,108,0.5));
-webkit-background-clip: text;
background-clip: text;
-webkit-text-fill-color: transparent;
filter: drop-shadow(0 1px 0 rgba(255,255,255,0.7)) drop-shadow(0 2px 6px rgba(45,106,79,0.18));
```

Never combine with `text-shadow` — incompatible with `background-clip: text`.

## Guardrails

- **Typography:** Plus Jakarta Sans → system-ui fallback
- **Radii:** 16px cards · 12px buttons/inner · 8px small · 20px pills
- **Shadows:** always 2–3 layers + `inset 0 1px 0` highlight. Never a single flat shadow.
- **Icons:** Phosphor inline SVGs. No emojis in UI chrome. Drag handles use `DotsSixVertical`.
- **No Apple SDK** — glass is pure CSS (`backdrop-filter` + gradient sheen). No external libs.
- All new semantic colors → CSS custom property in `:root` first.
- Derived colors use `rgba()` of the base hex, never new hex values.

## Modals

**Design rule: while a modal is open, the page behind it is inert.** No background
scrolling, no background clicks, no global shortcuts mutating background state.
A modal asks for the user's full attention — the calm way to do that is to quiet
everything else, not compete with it.

How it's enforced (every new modal must follow this):

1. Give the overlay the shared class **plus** its own: `overlay.className = 'modal-overlay my-new-overlay'`.
2. Append the overlay directly to `document.body`; close it by removing the overlay element.
3. That's it — a `MutationObserver` in app.js toggles `modal-open` on `<html>`
   (`overflow: hidden` on the root kills page scroll; on `body` alone Chromium
   still wheel-scrolls the viewport) whenever any `.modal-overlay` enters or
   leaves the DOM, so every open/close path is covered automatically.
4. The base `.modal-overlay` rule supplies `position: fixed; inset: 0` (backdrop
   swallows clicks) plus `overflow: hidden; overscroll-behavior: contain` so
   wheel/touch over the modal never chains to the page. Overlays still declare
   their own backdrop tint/blur/z-index. A modal taller than the viewport needs
   its own `max-height` + `overflow-y: auto` — all current modals have this.
5. Auto-focusing an input inside a modal must use
   `input.focus({ preventScroll: true })` — programmatic focus scrolling bypasses
   `overflow: hidden` and would jump the page behind the modal.
6. Global keyboard shortcuts (e.g. Cmd+Z undo) must bail early via `isModalOpen()`.

Scrolling *inside* a modal (e.g. day-transition checklist) is unaffected — only the
page behind it locks.

**Sub-dialogs inside a fullscreen overlay** (e.g. the focus-mode idle check): render
them as an absolutely-positioned scrim *inside* the existing `.modal-overlay`
(`position: absolute; inset: 0` + blur), not as a second body-level overlay — they
inherit the modal lock automatically and stack correctly. See `.focus-idle-scrim`.
