#COMPUTE — Frontend Design Specification

A complete build spec for recreating the **COMPUTE** marketing site — a platform for
deploying autonomous AI agents on distributed infrastructure. Hand this file to any
LLM (or developer) to reproduce a near-identical frontend.

> **Stack:** React (functional components + hooks) · Tailwind CSS · `lucide-react` for
> icons only. One component per section. Everything is dark-themed, editorial, animated,
> and typography-driven. Mobile-first.

---

## 1. Design System

### 1.1 Colors (3–5 total)

Dark by default. Near-black background, warm off-white text, muted gray, and a single
pink accent. **No gradients on primary elements** (the only exception is one animated
multi-color text gradient used for the hero word animation).

Define as CSS variables in OKLCH:

```css
:root {
  --background: oklch(0.06 0.008 260);        /* near-black, slightly cool */
  --foreground: oklch(0.94 0.005 90);         /* warm off-white */
  --card: oklch(0.09 0.008 260);
  --card-foreground: oklch(0.94 0.005 90);
  --muted: oklch(0.14 0.008 260);
  --muted-foreground: oklch(0.55 0.015 90);
  --border: oklch(0.18 0.008 260);
  --primary: oklch(0.94 0.005 90);
  --primary-foreground: oklch(0.06 0.008 260);
  --radius: 0.25rem;                          /* sharp, minimal corners */
}
```

**Accent color:** pink `#eca8d6` — used sparingly for status dots, active states,
checkmarks, progress bars, and connecting network lines only.

**Rules:**
- Never exceed 5 colors. Never use purple/violet prominently (it only appears mid-lerp
  inside the hero gradient animation).
- If you override a background color, always override the text color for contrast.
- Use semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`) — not raw `bg-black` / `text-white`.
- Always set the background on the `<html>` element.

### 1.2 Typography (2–3 families)

| Role | Font | Usage |
|------|------|-------|
| Display | **Instrument Serif** | All large headlines, big stats, numbers. `.font-display` |
| Sans (body) | **Instrument Sans** | Body copy, paragraphs, buttons. Default `font-sans` |
| Mono | **JetBrains Mono** | Eyebrow labels, tags, timestamps, captions. `font-mono` |

**Headline scale (huge & tight):**
- `text-6xl md:text-7xl lg:text-[128px]` (metrics section goes up to `140px`)
- `leading-[0.9]` or tighter, `tracking-tight`
- Two-line headlines are common: second line rendered in `text-muted-foreground`
- Body: `leading-relaxed` (1.4–1.6), never below 14px, never a decorative font
- Wrap important copy in `text-balance` / `text-pretty`

### 1.3 Layout

- Mobile-first. Flexbox for most layouts; CSS grid only for 2D layouts.
- Content container: `max-w-[1400px] mx-auto px-6 lg:px-12`
- Section padding: `py-24 lg:py-32` (hero-adjacent sections use `py-32 lg:py-40`)
- Prefer Tailwind spacing scale + `gap-*`; never mix margin/padding with gap on the same
  element; never use `space-*` utilities.

### 1.4 Shared Motion Patterns

**Scroll reveal (used by every section):**
`IntersectionObserver` (threshold ≈ 0.1) sets an `isVisible` state, toggling
`opacity-100 translate-y-0` vs `opacity-0 translate-y-8` with
`transition-all duration-700`/`duration-1000` and staggered `delay-100`/`delay-200`.

**Eyebrow label (reused everywhere):** mono, muted, preceded by a short rule.
```jsx
<span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
  <span className="w-12 h-px bg-foreground/30" />
  Capabilities
</span>
```

**Custom keyframes / utilities to define:**
- `marquee` — horizontal ticker loop
- `line-reveal` — width 0 → 100%
- `char-in` — per-letter fade/blur in
- `gradient-shift` — animated hero text gradient
- `progress` — width 0 → 100% (step/testimonial timers)
- `drawLine` — SVG `stroke-dashoffset` reveal for network lines
- `pulse` — dot pulsing
- `.text-stroke` — `-webkit-text-stroke: 1.5px currentColor; -webkit-text-fill-color: transparent;`

**Implementation notes:**
- Every interactive/animated section begins with `"use client"` and uses
  `useState` / `useEffect` / `useRef`.
- Canvas components: handle `devicePixelRatio` (cap at 2), resize listeners, and cancel
  animation frames on cleanup.
- Escape special JSX chars: `&lt;50ms`, `&ldquo;`, `&rarr;`, apostrophes as `&apos;`.
- Guard the live clock against hydration mismatch (state starts `null`, set in `useEffect`).
- Use tasteful placeholder images/video (abstract dark/organic visuals); use real brand
  SVGs for integration logos.

---

## 2. Page Structure

`<main>` renders these components in order:

1. Navigation
2. Hero
3. Features
4. HowItWorks
5. Infrastructure
6. Metrics
7. Integrations
8. Security
9. Developers
10. Testimonials
11. Pricing
12. CTA
13. Footer

---

## 3. Section Specifications

### 3.1 Navigation (`"use client"`, fixed)
- Fixed top nav that transforms on scroll (`window.scrollY > 20`):
  - **Scrolled:** floating rounded pill — `top-4 left-4 right-4`,
    `bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]`,
    height shrinks `h-20 → h-14`.
  - **At top:** transparent, full-width, white text.
- Logo: `COMPUTE` (display font) + tiny mono `TM` superscript.
- Links: Capabilities, Process, Infra, Integrations, Security — anchor links with an
  animated underline growing `w-0 → w-full` on hover.
- Right: "Sign in" text link + white `rounded-full` "Deploy agent" button.
- **Mobile:** hamburger (Menu/X) opens a full-screen overlay; links at `text-5xl font-display`,
  staggered fade-in, plus two full-width bottom CTAs.

### 3.2 Hero (`min-h-screen`, black bg)
- Fullscreen background `<video autoPlay muted loop playsInline>` at `opacity-80`, plus two
  overlay gradients (`from-black/70 via-black/30 to-transparent` and
  `from-black/20 to-black/60`) for legibility. (Placeholder abstract dark video.)
- Faint grid overlay: 8 horizontal + 12 vertical `bg-white/10` hairlines at `opacity-20`.
- Content left-aligned, `lg:max-w-[55%]`: mono eyebrow
  "Autonomous AI agents for distributed computing", then a giant headline
  `text-[clamp(2rem,6vw,7rem)] font-display`:
  - Line 1: "Distributed compute,"
  - Line 2: "agents that {ANIMATED WORD}"
- **Animated word:** cycles `["automate","delegate","execute","scale"]` every 2500ms.
  Each new word animates letter-by-letter: **blur-to-sharp + fade-in** (start
  `blur(20px) opacity:0` → `blur(0) opacity:1`, ~45ms stagger, ~500ms per letter). While
  animating, letters are colored along a gradient
  (`#eca8d6 → #a78bfa → #67e8f9 → #fbbf24 → #eca8d6`, lerped by letter position), then
  settle to white once all letters land.
- Bottom-left stats row (3 static metrics, values in display font, labels tiny/muted):
  - `3500+` — autonomous agents active
  - `99.7%` — distributed uptime
  - `<50ms` — execution latency

### 3.3 Features — "Intelligent workers." (`id="features"`)
- Diagonal header grid (`lg:grid-cols-12`): left `col-span-7` has eyebrow "Capabilities" +
  headline "Intelligent / workers." (second word muted). Right `col-span-5` a supporting
  paragraph.
- One large bento card (`min-h-[500px]`, black bg, `border-foreground/10`), split: left
  half is text (feature `01` **Autonomous Execution**, description, big `99.7%` stat);
  right 42% is a full-height image (mirrored via `scaleX(-1)`) fading into black on its
  left edge.
- Behind the left text: a **canvas particle field** — ~70 floating white dots (low
  opacity) drifting with sine/cosine flow, reacting to mouse proximity (cursor pushes
  particles), pulsing alpha.
- Underlying data array holds 4 features; only feature 01 shows in the large card.

### 3.4 How It Works — "Define. Deploy. Scale." (`id="how-it-works"`)
- Distinct darker bg (`oklch(0.09 0.01 260)`), white text, soft blurred radial glow
  bottom-left.
- Header split: left eyebrow "Process" + stacked headline where each word fades in
  opacity — "Define." (full white) / "Deploy." (white/30) / "Scale." (white/10). Right
  column: tall decorative image anchored to bottom (`object-contain object-bottom`) fading
  in on its left edge (e.g. a stylized tree).
- 3 step cards (`lg:grid-cols-3`), auto-advancing every 6000ms and clickable. Each shows a
  large display number (active = pink `#eca8d6`, inactive = white/20), an animated progress
  line filling over 6s when active, title + subtitle, description, and a pink bottom border
  that scales in when active. Steps:
  - 01 Define your agent
  - 02 Assign the task
  - 03 Monitor & scale
  - (Each also carries an illustrative code snippet in its data.)

### 3.5 Infrastructure — "Global by default." (`id="infra"`)
- Eyebrow "Global infrastructure". Header grid `[auto_1fr]`: left a globe/sphere image
  (`w-48 lg:w-72`), right headline "Global by / default." + paragraph (29 regions, sub-50ms
  latency).
- Main grid `lg:grid-cols-3`: large `col-span-2` card with an animated dot-network
  background — 20 pink dots on a 5×4 grid, each `pulse` animated, connected by SVG lines
  that animate via `drawLine` (stroke-dashoffset). Foreground: huge `29` + "regions" +
  caption.
- Right column: two stacked stat cards — `99.99%` Uptime SLA, `<50ms` Global latency.
- Below: 4 region cards (North America / Europe / Asia Pacific / South America) with node
  counts; one highlighted on a 3000ms rotating cycle (pink status dot + brighter border),
  each with a mono uppercase "operational" status.

### 3.6 Metrics — "Real-time agent metrics." (dark canvas bg)
- Full-section **canvas grid background**: dots on a 60px grid whose size oscillates with a
  traveling sine wave, plus a horizontal scan line.
- Header: mono `LIVE` badge (pink pulsing dot in `bg-[#eca8d6]/10`) + live UTC clock
  (updates every 1s, hydration-safe with `time` starting `null`), then giant headline
  "Real-time / agent metrics."
- A wide organic graph image spanning the full content width (placeholder abstract
  data-viz).
- 3 metric cards. Numbers **count up** on scroll into view (2500ms ease-out,
  `toLocaleString()` formatting, digits `blur-[1px]` while scrambling until 80% progress):
  - `12,847,392` — tasks completed today
  - `99.99%` — availability
  - `<340ms` — avg execution
  - Each card includes an animated **canvas dot-graph sparkline** (`DotGraph` component with
    configurable frequency/speed/amplitude, white or pink dots).
- Bottom mono ticker: OpenAI GPT-4 Turbo, Anthropic Claude 3, Mistral Large, Llama 3,
  +12 more.

### 3.7 Integrations — "Connect everything." (`id="integrations"`, centered)
- Centered eyebrow "Integrations" (rules on both sides), centered headline
  "Connect / everything.", centered paragraph ("100+ tools").
- Full-bleed image (`w-screen left-1/2 -translate-x-1/2`) of a connection/network graphic
  pulled up under the grid.
- Grid of 12 integration cards (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`):
  OpenAI, Anthropic, Slack, GitHub, Jira, AWS S3, Google Drive, Salesforce, HubSpot,
  Zapier, Snowflake, Stripe. Each card:
  - inline **brand SVG logo** (real brand paths)
  - mono category tag top-right (LLM, Comms, Code, PM, Storage, Docs, CRM, Marketing, Auto,
    Data, Payments)
  - name + animated bottom underline
  - **cursor-following radial halo** on hover
    (`radial-gradient(200px circle at cursor, rgba(255,255,255,0.1), transparent)`)
  - slight `scale-[1.02]` + border brighten on hover
  - stagger in (`index * 30 + 300ms`)
- Bottom stats row: `100+` Integrations, `OAuth` Auth built-in, `Webhooks` Real-time sync,
  plus a "View all integrations →" link whose arrow translates on hover.

### 3.8 Security — "Autonomous, not uncontrolled." (`id="security"`)
- Eyebrow "Security", headline "Autonomous, / not uncontrolled." + paragraph.
- Grid `lg:grid-cols-12`: left `col-span-7` visual card (`min-h-[400px]`) with cross-fading
  feature images (opacity toggle, desktop only, `object-right`), foreground "Active
  protection" label + huge `0` "Security incidents this year", and a bottom row of
  certification badges (SOC 2, ISO 27001, HIPAA, GDPR) staggering in.
- Right `col-span-5`: stack of 4 feature cards (lucide `Shield`, `Lock`, `Eye`,
  `FileCheck`) — Isolated execution, Encrypted memory, Full audit trails, Permission
  boundaries. One is active on a 3000ms rotating cycle AND on hover/click, syncing with the
  left image cross-fade. Active card: brighter border + filled icon box.

### 3.9 Developers — "Code your agents. Or let them code."
- Large decorative image absolutely positioned bottom-right (`w-[55%] h-[85%]`) behind
  content, fading into the background on its left and top edges.
- Eyebrow "Developer SDK", headline "Code your agents. / Or let them code." (second line
  muted).
- Left-half (`max-w-[50%]`) paragraph + a 2-column grid of 4 features: TypeScript native,
  Streaming results, Multi-model support, Local debugging.

### 3.10 Testimonials — "Trusted by teams worldwide." (inverted)
- **Inverted section:** `bg-foreground text-background`. Faint random-character ASCII
  texture background at `text-background/[0.02]`.
- Header: eyebrow "Testimonials" + headline "Trusted by teams worldwide." + prev/next arrow
  buttons (lucide `ArrowLeft`/`ArrowRight`).
- Split `lg:grid-cols-12`: left `col-span-7` a giant decorative `"` quote mark + the active
  quote in `text-3xl→5xl font-display` (re-animates with fadeSlideIn on change) + author
  avatar (initial letter) with name/role/company. Right `col-span-5`: a large metric card
  (`80%`, `10x`, `40x`, `0`), a row of progress-bar indicators (active bar fills over 8s),
  and clickable company chips.
- 4 testimonials auto-rotate every 8000ms; arrows and chips control direction. Companies:
  Meridian Labs, Flux Systems, Beacon AI, Prism Analytics.

### 3.11 Pricing — "Pay for results." (`id="pricing"`)
- Header grid: left `col-span-7` eyebrow "Pricing" + headline "Pay for / results." where
  "results." uses the `.text-stroke` outline effect. Right `col-span-5` a decorative image.
- 3 plan cards `lg:grid-cols-3` with an overlapping-cards effect on desktop (highlighted
  middle card `lg:-mx-2 lg:z-10 lg:scale-105 border-foreground`, others overlap slightly
  with `border-foreground/10`). Plans:
  - **Explorer** — $0 — 3 agents, 1,000 tasks/mo, community support. CTA "Start free".
  - **Builder** (highlighted, "Most Popular" badge w/ lucide `Zap`) — $65/$79 — 25 agents,
    50k tasks, priority support. CTA "Start trial".
  - **Scale** — Custom — unlimited, on-prem, SLA, dedicated compute. CTA "Contact sales".
  - Each card: mono index number, name, description, price (annual/monthly toggle state,
    default annual), feature list with pink lucide `Check` marks, CTA button with a
    hover-translating `ArrowRight`.
- Bottom row: three inline checkmark assurances (Encrypted execution, Full audit logs,
  Multi-model routing) + "Compare all features" link.

### 3.12 CTA — "Ready to delegate to AI agents?"
- Single bordered box (`border-foreground`) with a mouse-following radial **spotlight**
  overlay (`radial-gradient(600px circle at cursor, rgba(0,0,0,0.15), transparent)`,
  opacity-10) and decorative L-shaped corner brackets.
- Left: headline "Ready to delegate / to AI agents?", paragraph, two buttons ("Deploy your
  first agent" filled w/ ArrowRight, "Book a demo" outline; both `rounded-full h-14`), mono
  note "1,000 free tasks with COMPUTE". Right (desktop): large decorative image
  (`w-[600px] h-[650px]`, `object-bottom`).

### 3.13 Footer (black bg)
- Top: panoramic banner image (`h-[340px] md:h-[420px]`) fading to black at the bottom +
  side vignettes.
- Content grid `md:grid-cols-6`: brand column (`col-span-2`) with COMPUTE logo + TM,
  tagline, and social links (Twitter, GitHub, LinkedIn) each with a hover-revealing lucide
  `ArrowUpRight`. Four link columns: Product, Developers, Company (Careers has a "Hiring"
  pill badge), Legal.
- Bottom bar (`border-t border-white/10`): "© 2025 COMPUTE. All rights reserved." + a pink
  status dot "All agents operational". (Optional footer wave-canvas helper.)

---

## 4. Accessibility & Quality Checklist

- Semantic HTML (`<main>`, `<header>`, `<nav>`, `<section>`, `<footer>`).
- Correct ARIA roles/attributes; `sr-only` for screen-reader-only text.
- Alt text on all meaningful images; decorative images marked appropriately.
- Enter-to-submit handlers must ignore IME composition
  (`event.nativeEvent.isComposing` / `keyCode === 229`).
- Verify at a 300×599 mobile viewport in dark mode first; all other breakpoints must also
  work.
- No emojis as icons — lucide only.