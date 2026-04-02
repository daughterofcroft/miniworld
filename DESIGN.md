# Design System — Miniworld

## Product Context
- **What this is:** A persistent world-building protocol on Sui. The reference game is a 32x32 tile grid that evolves via Game of Life pulses.
- **Who it's for:** Sui builders and game devs (builders), plus players who interact with the world directly (experience).
- **Space/industry:** On-chain autonomous worlds, blockchain gaming
- **Project type:** Game/experience + developer infrastructure (serves both equally)

## Aesthetic Direction
- **Direction:** Organic/Living Systems
- **Decoration level:** Intentional (subtle grain texture, glow halos on alive cells)
- **Mood:** Looking through a microscope at something alive. Deep ocean, bioluminescent, warm and mysterious. Not a developer tool. A world.
- **Differentiation:** Every autonomous world project (Lattice/MUD, etc.) looks like infrastructure. Dark theme + monospace + neon. Miniworld is the first one that looks like a world.

## Typography
- **Logo/Brand:** Pacifico — distinctive script font. Warm, alive, instantly recognizable. Nobody in crypto uses this. That's the point.
- **Display/Headings:** Fraunces (variable, opsz 9-144, weight 300-500) — organic serif with generous proportions. Soft curves, feels like something alive grew it.
- **Body:** Instrument Sans (400, 500, 600) — clean, modern, pairs well with the serif display
- **UI/Labels:** Instrument Sans (same as body)
- **Data/Tables:** Geist Mono — tabular-nums for epoch counters, addresses, stats
- **Loading:** Google Fonts CDN
  - `https://fonts.googleapis.com/css2?family=Pacifico&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap`
- **Scale:** 48 / 32 / 24 / 18 / 16 / 14 / 12 px

## Color
- **Approach:** Restrained — warm bioluminescent tones on deep dark backgrounds
- **Background:** #0a0e14 (deep ocean)
- **Surface:** #131922 (raised panels, cards)
- **Surface hover:** #1a2332
- **Border:** #1e2a3a
- **Primary text:** #d4dae3 (cool silver)
- **Muted text:** #5c6773
- **Accent:** #e6b450 (warm amber — life, user actions, CTAs)
- **Accent dim:** rgba(230, 180, 80, 0.15) (badges, backgrounds)
- **Life/GoL births:** #4ade80 (emerald pulse)
- **Life dim:** rgba(74, 222, 128, 0.15)
- **User tiles:** owner-address hashed to HSL hue (existing behavior)
- **Error:** #ef4444
- **Dark mode:** This IS dark mode. No light mode planned for Stage 1.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — the world needs room to breathe
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined
- **Hero element:** The 32x32 world grid commands the viewport. Everything else frames it.
- **Grid structure:** Stats bar above, grid center, controls below, timeline bottom
- **Max content width:** 960px
- **Border radius:** sm: 4px, md: 8px, lg: 12px, full: 9999px (pills/badges)

## Motion
- **Approach:** Intentional
- **Cell birth/death:** 150ms fade in/out (ease-out)
- **Pulse countdown:** Subtle heartbeat animation on the epoch counter
- **Grid transitions:** Organic, not mechanical
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)

## Grid Rendering
- **Cell size:** 14-16px depending on viewport
- **Gap:** 1px between cells
- **Dead cells:** rgba(255, 255, 255, 0.03) — barely visible, gives depth
- **Alive cells (user-placed):** Colored by owner address HSL hue, with glow box-shadow
- **Alive cells (GoL-born):** #4ade80 emerald with green glow
- **Hover:** rgba(255, 255, 255, 0.08)
- **Selected cell:** 2px white outline inset
- **Container:** Surface background with border, rounded corners

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-02 | Initial design system | Created by /design-consultation. Organic/Living Systems aesthetic. |
| 2026-04-02 | Pacifico for logo | User preference. Distinctive script, warm, differentiates from every monospace crypto logo. |
| 2026-04-02 | Fraunces over Instrument Serif | Instrument Serif felt squashed. Fraunces has generous, organic proportions. |
| 2026-04-02 | Warm amber + emerald palette | Deliberate departure from neon blue/purple crypto defaults. Bioluminescent, alive. |
| 2026-04-02 | Serif display headings | Nobody in crypto uses serifs. Says "world with history" not "dev tool." |
