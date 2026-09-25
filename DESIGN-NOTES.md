# CenterMint site: design notes

Redesign of September 2026. Same URLs, same SEO copy, new look.

## Idea

A trading card is a printed sheet that was die-cut. Bad centering is a print-registration and die-cut problem, so the whole site borrows from a print shop's proofing desk: registration marks, CMY process inks, trim marks, a colour control strip, the cool white of a viewing lightbox, and a green self-healing cutting mat.

Anything else that would fit "a generic app landing page" was dropped: no gradient blobs, no rounded card grids, no pill buttons, no eyebrow labels.

## Colour

| Name | Hex | Role |
|---|---|---|
| Proof White | `#F3F5F7` | page background (a cool lightbox white, never cream) |
| Sheet | `#FFFFFF` | the lit panel on the lightbox, form fields, the Free sheet |
| Registration Ink | `#14161A` | text, the Pro sheet, device bodies |
| Ink 2 | `#4A515C` | secondary text (7:1 on Proof White) |
| Rule | `#CDD3DA` | hairlines and trim lines |
| Process Cyan | `#00A0DC` | measurement lines, link underlines |
| Process Magenta | `#D6247B` | flags, "does not" marks, focus ring |
| Process Yellow | `#F2C200` | only inside registration marks and the colour strip |
| Cutting-Mat Green | `#2E5B4F` | the video block and the footer, with a faint 10 mm grid |
| Mat Ink | `#E8F0EC` | text on the mat |

C, M and Y never fill large areas. They appear as thin lines, registration marks and the colour control strip at the top of every page. Magenta text is only used at 600+ weight where contrast is 4.9:1.

## Type

- Archivo (variable, self-hosted woff2: latin, latin-ext, vietnamese). Headlines use the wide end of the width axis (`font-stretch: 112–125%`) at 700–800; body text is normal width at 400.
- All figures use `font-variant-numeric: tabular-nums` so ratios such as 52.9 / 47.1 line up like a densitometer readout.
- CJK falls back to system fonts per language (`:lang()`): PingFang SC / TC, Hiragino Sans, Apple SD Gothic Neo, then Noto and Windows fonts. No CJK web fonts are loaded. CJK headlines get more line height and a smaller size.

## Layout (desktop home)

```
┌ colour control strip (C M Y K patches) ──────────────────────────────┐
│ ⊕ CenterMint                                 Language ▾   Download   │
├──────────────────────────────┬───────────────────────────────────────┤
│ H1 (wide Archivo)            │  LIGHTBOX (sticky, 100vh)             │
│ lede                         │   ┌ trim marks ┐                      │
│ [App Store badge] [QR]       │   │  3D card   │  ← WebGL, loupe      │
│ imprint paragraph            │   └────────────┘                      │
├──────────────────────────────┤   readout  L/R 52.9 / 47.1            │
│ How to measure (5 steps,     │            T/B 50.6 / 49.4            │
│ each ~85vh, drives the 3D)   │                                       │
├──────────────────────────────┴───────────────────────────────────────┤
│ Before you pay to grade: feature rows, text | device, alternating    │
│   guided line check · Worth Grading? + live calculator · close-ups   │
│   contact sheet · Submission Log · share image · batch + PDF         │
├──────────────────── cutting mat (green, grid) ───────────────────────┤
│ Watch it measure            [p5 video, muted loop]                   │
├──────────────────────────────────────────────────────────────────────┤
│ Free sheet (white)  ┆ perforation ┆  Pro sheet (ink)                  │
│ What it does not do (magenta delete marks)                           │
│ FAQ (details)            | Guides index                              │
├──────────────────── cutting mat footer ──────────────────────────────┤
│ big wordmark, badge, QR, languages, privacy, terms, contact          │
└──────────────────────────────────────────────────────────────────────┘
```

Phone (390 px): single column. Hero shows the tall p5 video instead of WebGL. Each how-to step carries its own small proof figure (card photo plus an SVG overlay showing that step). A slim App Store bar appears at the bottom once the hero badge has scrolled away and hides again at the footer.

## The one memorable moment

Desktop hero, Three.js: our own sample card floats tilted above the lightbox. Scrolling lays it flat; trim marks appear at the outer corners; three registration marks per corner (cyan, magenta, yellow, drawn with multiply blending) fly in from the corners and converge until they print as one black mark on the inner printed border; the four measurement lines snap on with a small overshoot; the readout rolls to 52.9 / 47.1 and 50.6 / 49.4. Step 4 lights up the PSA 10 front reference (55/45) with a small gauge in the readout, step 5 outlines the eight close-up regions. The pointer is a loupe (fragment shader magnification with a CMY fringe on the rim and a registration cross in the middle).

Everything else is quiet: no scroll-reveal fades, no hover lifts.

## Effects used

- Three.js r170 (ES module from jsDelivr): card with rounded-corner SDF mask, fake sheen, contact shadow, shader loupe, multiply-blended registration marks. Loaded only on wide screens with a fine pointer, WebGL, 4+ cores, no Save-Data and no reduced motion.
- GSAP 3.15 + ScrollTrigger for the step timeline; Lenis 1.3 for smooth wheel scrolling (desktop only).
- p5.js generative video (tools/p5-video), rendered offline to H.264 and VP9. Used as the phone hero and in the "Watch it measure" block. With reduced motion it does not autoplay; the poster is shown.
- Odometer digits in the readout.
- Performance: Archivo is self-hosted and preloaded; the phone hero preloads the video poster; the stage script does nothing on phones; far-below sections use `content-visibility: auto`. Lighthouse on a heavily loaded dev machine without gzip: mobile 92 / 100 / 100 / 100, desktop 99 / 100 / 100 / 100 (performance / accessibility / best practices / SEO).
- Fallbacks: without WebGL, the same stage is an image with an SVG overlay driven by IntersectionObserver; with reduced motion, it shows the final measured state.

## Removed on the last pass

- A translucent 55/45 tolerance band drawn around the left line in 3D. At real scale it is only about 4 px wide, so it read as a rendering glitch; the readout gauge says the same thing clearly.

## Do not repeat next time

Registration-mark / proofing-desk language, cool proof white plus cutting-mat green, Archivo wide headlines.
