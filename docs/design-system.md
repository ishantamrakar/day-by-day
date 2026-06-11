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

**Background:** `#EEF2EE` base + three `position: fixed` blob divs (`body::before`, `body::after`, `#blob3`). Blobs use `radial-gradient` + `filter: blur(60px)`, animated on 22s/28s/34s cycles. No `background-attachment: fixed`.

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
