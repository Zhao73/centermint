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
- All figures use `font-variant-numeric: tabular-nums` so ratios such as 54.4 / 45.6 line up like a densitometer readout.
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
├──────────────────────────────┤   readout  L/R 54.4 / 45.6            │
│ How to measure (5 steps,     │            T/B 51.9 / 48.1            │
│ each ~85vh, drives the 3D)   │                                       │
├──────────────────────────────┴───────────────────────────────────────┤
│ Before you pay to grade: feature rows, text | device, alternating    │
│   guided line check · Worth Grading? + live calculator · close-ups   │
│   contact sheet · Submission Log · share image · batch + PDF         │
├──────────────────── cutting mat (green, grid) ───────────────────────┤
│ (removed: loops now sit after the hero)                          │
├──────────────────────────────────────────────────────────────────────┤
│ Free sheet (white)  ┆ perforation ┆  Pro sheet (ink)                  │
│ What it does not do (magenta delete marks)                           │
│ FAQ (details)            | Guides index                              │
├──────────────────── cutting mat footer ──────────────────────────────┤
│ big wordmark, badge, QR, languages, privacy, terms, contact          │
└──────────────────────────────────────────────────────────────────────┘
```

Phone (390 px): single column. Hero shows the real sample card on a small lightbox with the same SVG overlay as the step figures, measured in a 10 s CSS loop (static final state with reduced motion); the card image is preloaded with srcset, so it is the LCP. Each how-to step carries its own small proof figure (card photo plus an SVG overlay showing that step). A slim App Store bar appears at the bottom once the hero badge has scrolled away and hides again at the footer.

## The one memorable moment

Desktop hero, Three.js: the sample card (a real card, see below) floats tilted above the lightbox. Scrolling lays it flat; trim marks appear at the outer corners; three registration marks per corner (cyan, magenta, yellow, drawn with multiply blending) fly in from the corners and converge until they print as one black mark on the inner printed border; the four measurement lines snap on with a small overshoot; the readout rolls to 52.9 / 47.1 and 50.6 / 49.4. Step 4 lights up the PSA 10 front reference (55/45) with a small gauge in the readout, step 5 outlines the eight close-up regions. The pointer is a loupe (fragment shader magnification with a CMY fringe on the rim and a registration cross in the middle).

Everything else is quiet: no scroll-reveal fades, no hover lifts.

## Effects used

- Three.js r170 (ES module from jsDelivr): card with rounded-corner SDF mask, fake sheen, contact shadow, shader loupe, multiply-blended registration marks. Loaded only on wide screens with a fine pointer, WebGL, 4+ cores, no Save-Data and no reduced motion.
- GSAP 3.15 + ScrollTrigger for the step timeline; Lenis 1.3 for smooth wheel scrolling (desktop only).
- p5.js video (tools/p5-video), rendered offline and streamed straight into ffmpeg (H.264 and VP9, no frame files). A loupe travels round the real card, each line settles on the inner edge of the printed border, then the ratios are checked against the PSA 10 front reference. Only in the "Watch it measure" block (tablet and desktop). With reduced motion it does not autoplay; the poster is shown.
- Odometer digits in the readout.
- Performance: Archivo is self-hosted and preloaded; the phone hero preloads the card image (srcset); the stage script does nothing on phones; far-below sections use `content-visibility: auto`. Lighthouse on a heavily loaded dev machine without gzip: mobile 92 / 100 / 100 / 100, desktop 99 / 100 / 100 / 100 (performance / accessibility / best practices / SEO).
- Fallbacks: without WebGL, the same stage is an image with an SVG overlay driven by IntersectionObserver; with reduced motion, it shows the final measured state.

## Removed on the last pass

- A translucent 55/45 tolerance band drawn around the left line in 3D. At real scale it is only about 4 px wide, so it read as a rendering glitch; the readout gauge says the same thing clearly.

## Do not repeat next time

Registration-mark / proofing-desk language, cool proof white plus cutting-mat green, Archivo wide headlines.

## Sample card (September 2026)

Every card on the site is real: a 1999 Pokémon Base Set Charizard, from a public scan upscaled 4x (tools/make_real_card.py). The drawn baseball card and the abstract p5 cards were removed.

- Line positions: `tools/src/art/real/charizard-measure.json` (inner edge of the yellow border, measured on the 2400 x 3300 scan).
- Numbers shown everywhere (page, 3D stage, video, OG image): `tools/src/art/real/charizard-app.json`, the app's own automatic reading (54.4 / 45.6, 51.9 / 48.1), so the page matches the App screenshots. The two sources differ by about 1 px on the scan.
- tools/build.py reads both and writes the overlays, readouts, the stage's `data-card`, and tools/og/og.html (template tools/templates/og.html). It stops the build if the card no longer sits inside the 55/45 reference the page claims.
- Screenshots: tools/import_shots.py prefers `tmp/raw-site/` (real card) over `tmp/raw-v3/` (App Store set, drawn card) and records the source in assets/shots/sources.json; build.py never shows a raw-v3 screenshot that has a card in it (result, guide, closeups, share) and uses the English raw-site one instead.
- Footer on every page: trademark notice for Pokémon and the card images (Nintendo, Creatures, GAME FREAK, The Pokémon Company; no affiliation or endorsement).

## See it in the app (September 2026, revised)

Six separate one-shape loops (measure, check each line, Worth Grading?, close-ups, Submission Log, Share Studio),
each 6 to 8 s, right after the hero on phones (a swipeable row) and after the measuring story on desktop (three
columns), before the features. Black, white and greys only on a light warm-grey stage (#ECEBE8); the card keeps
its colours. Archivo. Details: tools/flow-video/README.md. The earlier single 16 s loop and the p5 "Watch it
measure" block are gone from the page.

Hero headline: Archivo at normal width (font-stretch 100 %, weight 800, tight tracking) in every Latin-script
language; the wide cut read as stretched on phones. Section headings keep the wider cut.

Phones and tablets no longer show a proof figure under every how-to step: the loops above show the same steps.

## Section pages and tabs (September 2026)

Every page shares one header (tools/templates/_masthead.html): logo, tabs Features / Pricing / Guides / FAQ, language
menu, Download. Phones: the tabs are a slim scrollable row under the logo (all four fit at 390 px in every
language); from 960 px they sit inline. The current tab gets an ink underline.

New pages per language: /features/ (the full feature rows, the calculator and "What CenterMint does not do"),
/pricing/ (Free vs Pro plus the Pro price table for that language's App Store regions), /guides/ (index of the
guides and calculator, English versions tagged where a language has none) and /faq/ (all questions). The home page
keeps hero, the six loops, the measuring steps (desktop 3D story and HowTo data), a short feature list, a price
summary and four FAQ questions, each linking on.

Pro is monthly or yearly only; the yearly plan has a 1-week free trial. Prices live in tools/build.py (PRICES,
REGIONS_BY_LANG) and feed both the page and the SoftwareApplication offers, so they cannot disagree.
