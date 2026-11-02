import { useCallback } from 'react'
import { motion } from 'framer-motion'
import Particles from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'

/* ─── SVG Cherry Blossom Tree ─────────────────────────────
   Designed to sit anchored at the bottom-right as a full
   atmospheric scene element — NOT a floating widget.
   The tree extends off-canvas (negative margins) so it
   bleeds into the background naturally.
─────────────────────────────────────────────────────────── */
function TreeScene() {
  return (
    <svg
      viewBox="0 0 520 680"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMax meet"
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* Root glow */}
        <radialGradient id="rootGlow" cx="55%" cy="92%" r="40%">
          <stop offset="0%"   stopColor="#eca8d6" stopOpacity="0.25" />
          <stop offset="50%"  stopColor="#d4709e" stopOpacity="0.10" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>

        {/* Trunk gradient — warm bark */}
        <linearGradient id="trunkG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#2e1a0e" />
          <stop offset="35%"  stopColor="#4a2c18" />
          <stop offset="65%"  stopColor="#3d2414" />
          <stop offset="100%" stopColor="#1e1008" />
        </linearGradient>

        {/* Branch gradients */}
        <linearGradient id="branchG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#3d2414" />
          <stop offset="100%" stopColor="#2a180a" />
        </linearGradient>

        {/* Blossom cluster — layered radials */}
        <radialGradient id="bG1" cx="45%" cy="35%" r="55%">
          <stop offset="0%"   stopColor="#fce8f4" stopOpacity="0.92" />
          <stop offset="40%"  stopColor="#f5c6e8" stopOpacity="0.80" />
          <stop offset="75%"  stopColor="#eca8d6" stopOpacity="0.60" />
          <stop offset="100%" stopColor="#d4709e" stopOpacity="0.20" />
        </radialGradient>
        <radialGradient id="bG2" cx="55%" cy="40%" r="55%">
          <stop offset="0%"   stopColor="#fff0f8" stopOpacity="0.88" />
          <stop offset="45%"  stopColor="#f8d8ee" stopOpacity="0.72" />
          <stop offset="80%"  stopColor="#eca8d6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#c96098" stopOpacity="0.15" />
        </radialGradient>
        <radialGradient id="bG3" cx="50%" cy="30%" r="60%">
          <stop offset="0%"   stopColor="#fff4fa" stopOpacity="0.95" />
          <stop offset="35%"  stopColor="#fce8f4" stopOpacity="0.80" />
          <stop offset="70%"  stopColor="#f5c6e8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#eca8d6" stopOpacity="0.20" />
        </radialGradient>

        {/* Soft bloom glow filter */}
        <filter id="blossomGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Trunk bark texture filter */}
        <filter id="barkTexture">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Atmospheric edge fade */}
        <radialGradient id="sceneFade" cx="60%" cy="85%" r="70%">
          <stop offset="0%"   stopColor="transparent" stopOpacity="0" />
          <stop offset="60%"  stopColor="transparent" stopOpacity="0" />
          <stop offset="100%" stopColor="#180b0b" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      {/* Root ground glow — atmospheric base */}
      <ellipse cx="310" cy="645" rx="190" ry="38"
        fill="url(#rootGlow)" />

      {/* Trunk — thick, twisted, textured */}
      <path
        d="M270 680 C265 640 260 608 262 572 C264 538 272 510 285 482 C296 458 308 440 316 418 C325 440 332 462 338 490 C346 522 348 552 342 588 C336 620 332 648 330 680Z"
        fill="url(#trunkG)"
        filter="url(#barkTexture)"
        opacity="0.96"
      />
      {/* Trunk highlight — inner light */}
      <path
        d="M288 640 C286 608 284 580 286 555 C288 530 296 510 304 492 C310 480 316 470 316 460 C320 472 322 488 326 510 C332 540 334 568 328 600 C324 628 320 654 318 680Z"
        fill="rgba(255,255,255,0.04)"
      />

      {/* === ROOT FLARE BRANCHES === */}
      <path d="M270 660 C248 655 222 652 196 648 C178 645 164 640 150 638"
        stroke="url(#trunkG)" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
      <path d="M330 660 C352 655 374 650 396 645 C412 641 424 636 440 632"
        stroke="url(#trunkG)" strokeWidth="14" strokeLinecap="round" opacity="0.85" />
      <path d="M260 648 C240 640 218 630 200 625"
        stroke="url(#branchG)" strokeWidth="8" strokeLinecap="round" opacity="0.7" />

      {/* === MAIN LOWER BRANCHES === */}
      {/* Far left sweeping branch */}
      <path d="M274 530 C248 510 218 490 185 475 C158 463 130 458 100 460 C76 462 55 468 38 478"
        stroke="url(#branchG)" strokeWidth="16" strokeLinecap="round" opacity="0.92" />
      <path d="M190 472 C168 460 148 445 128 432 C110 422 88 416 66 420"
        stroke="url(#branchG)" strokeWidth="10" strokeLinecap="round" opacity="0.82" />
      <path d="M120 445 C100 432 82 418 62 408 C48 400 32 396 18 400"
        stroke="url(#branchG)" strokeWidth="6" strokeLinecap="round" opacity="0.72" />
      <path d="M72 420 C58 408 44 395 28 385 C16 378 4 376 -8 382"
        stroke="url(#branchG)" strokeWidth="4" strokeLinecap="round" opacity="0.62" />

      {/* Right sweeping branch */}
      <path d="M334 516 C360 494 392 474 424 458 C450 445 474 438 500 435 C516 432 528 433 538 438"
        stroke="url(#branchG)" strokeWidth="15" strokeLinecap="round" opacity="0.90" />
      <path d="M420 452 C448 440 472 426 498 414"
        stroke="url(#branchG)" strokeWidth="9" strokeLinecap="round" opacity="0.78" />
      <path d="M490 418 C510 406 526 396 540 390"
        stroke="url(#branchG)" strokeWidth="5" strokeLinecap="round" opacity="0.65" />

      {/* Mid left branch */}
      <path d="M280 480 C256 460 228 440 198 422 C172 406 148 396 120 392"
        stroke="url(#branchG)" strokeWidth="12" strokeLinecap="round" opacity="0.85" />
      <path d="M200 418 C176 404 154 390 130 380 C112 372 92 370 72 376"
        stroke="url(#branchG)" strokeWidth="7" strokeLinecap="round" opacity="0.72" />

      {/* Upper trunk split */}
      <path d="M296 418 C278 390 258 362 238 334 C220 310 200 292 180 278"
        stroke="url(#branchG)" strokeWidth="14" strokeLinecap="round" opacity="0.88" />
      <path d="M236 332 C218 312 198 296 178 284 C162 274 144 270 126 274"
        stroke="url(#branchG)" strokeWidth="9" strokeLinecap="round" opacity="0.78" />
      <path d="M180 280 C162 268 144 254 124 244 C108 236 90 234 72 240"
        stroke="url(#branchG)" strokeWidth="6" strokeLinecap="round" opacity="0.68" />

      {/* Upper right branch */}
      <path d="M328 400 C354 374 382 348 412 324 C436 304 460 290 488 282 C508 276 524 275 534 280"
        stroke="url(#branchG)" strokeWidth="13" strokeLinecap="round" opacity="0.86" />
      <path d="M408 322 C434 306 456 292 480 280 C498 272 514 268 528 272"
        stroke="url(#branchG)" strokeWidth="8" strokeLinecap="round" opacity="0.74" />

      {/* Top branches */}
      <path d="M308 360 C292 332 272 304 250 278 C232 256 212 240 190 230"
        stroke="url(#branchG)" strokeWidth="10" strokeLinecap="round" opacity="0.82" />
      <path d="M252 280 C234 264 214 248 192 236 C174 226 154 222 132 228"
        stroke="url(#branchG)" strokeWidth="6" strokeLinecap="round" opacity="0.70" />
      <path d="M322 330 C342 308 366 286 394 268 C416 254 438 246 462 244"
        stroke="url(#branchG)" strokeWidth="9" strokeLinecap="round" opacity="0.80" />
      <path d="M392 268 C416 254 440 242 466 234"
        stroke="url(#branchG)" strokeWidth="5" strokeLinecap="round" opacity="0.65" />

      {/* Fine tip branches */}
      <path d="M186 276 C172 262 158 248 144 238" stroke="url(#branchG)" strokeWidth="4" strokeLinecap="round" opacity="0.60" />
      <path d="M132 228 C116 218 100 212 82 216" stroke="url(#branchG)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M192 232 C178 218 164 206 148 198" stroke="url(#branchG)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M460 246 C476 234 492 224 510 218" stroke="url(#branchG)" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M534 280 C546 268 556 258 564 250" stroke="url(#branchG)" strokeWidth="3" strokeLinecap="round" opacity="0.50" />

      {/* === BLOSSOM CLOUDS ===
           Layered soft clusters — no hard circles, overlapping organic shapes.
           Each cluster = 3 overlapping ellipses of slightly different shade. */}
      
      {/* Far left arm blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="36"  cy="476" rx="38" ry="28" fill="url(#bG1)" opacity="0.90" />
        <ellipse cx="58"  cy="458" rx="32" ry="24" fill="url(#bG2)" opacity="0.80" />
        <ellipse cx="22"  cy="460" rx="26" ry="20" fill="url(#bG3)" opacity="0.75" />
        <ellipse cx="12"  cy="390" rx="28" ry="22" fill="url(#bG1)" opacity="0.82" />
        <ellipse cx="32"  cy="376" rx="24" ry="18" fill="url(#bG2)" opacity="0.72" />
        <ellipse cx="-4"  cy="400" rx="20" ry="16" fill="url(#bG3)" opacity="0.65" />
        <ellipse cx="70"  cy="418" rx="34" ry="26" fill="url(#bG1)" opacity="0.85" />
        <ellipse cx="82"  cy="400" rx="26" ry="20" fill="url(#bG2)" opacity="0.75" />
        <ellipse cx="58"  cy="432" rx="22" ry="18" fill="url(#bG3)" opacity="0.68" />
      </g>

      {/* Left arm middle blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="122" cy="392" rx="36" ry="28" fill="url(#bG2)" opacity="0.88" />
        <ellipse cx="140" cy="374" rx="30" ry="24" fill="url(#bG1)" opacity="0.80" />
        <ellipse cx="108" cy="378" rx="26" ry="20" fill="url(#bG3)" opacity="0.74" />
        <ellipse cx="130" cy="240" rx="34" ry="28" fill="url(#bG1)" opacity="0.85" />
        <ellipse cx="148" cy="222" rx="28" ry="22" fill="url(#bG2)" opacity="0.78" />
        <ellipse cx="114" cy="252" rx="24" ry="18" fill="url(#bG3)" opacity="0.70" />
        <ellipse cx="80"  cy="216" rx="30" ry="24" fill="url(#bG1)" opacity="0.80" />
        <ellipse cx="64"  cy="230" rx="22" ry="18" fill="url(#bG3)" opacity="0.68" />
      </g>

      {/* Upper left branch blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="184" cy="280" rx="38" ry="30" fill="url(#bG1)" opacity="0.90" />
        <ellipse cx="200" cy="262" rx="32" ry="24" fill="url(#bG2)" opacity="0.82" />
        <ellipse cx="168" cy="268" rx="28" ry="22" fill="url(#bG3)" opacity="0.76" />
        <ellipse cx="192" cy="232" rx="30" ry="24" fill="url(#bG1)" opacity="0.84" />
        <ellipse cx="208" cy="216" rx="26" ry="20" fill="url(#bG2)" opacity="0.75" />
        <ellipse cx="176" cy="248" rx="22" ry="18" fill="url(#bG3)" opacity="0.68" />
        <ellipse cx="148" cy="200" rx="28" ry="22" fill="url(#bG1)" opacity="0.78" />
        <ellipse cx="162" cy="186" rx="22" ry="18" fill="url(#bG2)" opacity="0.70" />
      </g>

      {/* Crown center blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="252" cy="282" rx="40" ry="32" fill="url(#bG3)" opacity="0.92" />
        <ellipse cx="270" cy="262" rx="36" ry="28" fill="url(#bG1)" opacity="0.85" />
        <ellipse cx="236" cy="268" rx="30" ry="24" fill="url(#bG2)" opacity="0.78" />
        <ellipse cx="258" cy="248" rx="28" ry="22" fill="url(#bG3)" opacity="0.82" />
        <ellipse cx="240" cy="260" rx="24" ry="20" fill="url(#bG1)" opacity="0.75" />
      </g>

      {/* Right upper arm blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="396" cy="270" rx="38" ry="30" fill="url(#bG2)" opacity="0.88" />
        <ellipse cx="414" cy="252" rx="32" ry="26" fill="url(#bG1)" opacity="0.80" />
        <ellipse cx="378" cy="256" rx="28" ry="22" fill="url(#bG3)" opacity="0.74" />
        <ellipse cx="460" cy="246" rx="36" ry="28" fill="url(#bG1)" opacity="0.86" />
        <ellipse cx="476" cy="230" rx="30" ry="24" fill="url(#bG2)" opacity="0.78" />
        <ellipse cx="444" cy="236" rx="26" ry="20" fill="url(#bG3)" opacity="0.70" />
        <ellipse cx="510" cy="220" rx="32" ry="26" fill="url(#bG1)" opacity="0.82" />
        <ellipse cx="526" cy="204" rx="26" ry="20" fill="url(#bG2)" opacity="0.74" />
      </g>

      {/* Right mid arm blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="500" cy="436" rx="36" ry="28" fill="url(#bG1)" opacity="0.88" />
        <ellipse cx="516" cy="418" rx="30" ry="24" fill="url(#bG2)" opacity="0.78" />
        <ellipse cx="484" cy="422" rx="26" ry="20" fill="url(#bG3)" opacity="0.72" />
        <ellipse cx="528" cy="278" rx="32" ry="26" fill="url(#bG1)" opacity="0.84" />
        <ellipse cx="542" cy="260" rx="26" ry="22" fill="url(#bG2)" opacity="0.76" />
        <ellipse cx="514" cy="266" rx="22" ry="18" fill="url(#bG3)" opacity="0.68" />
      </g>

      {/* Left lower arm blossoms */}
      <g filter="url(#blossomGlow)">
        <ellipse cx="100" cy="462" rx="42" ry="32" fill="url(#bG1)" opacity="0.90" />
        <ellipse cx="120" cy="442" rx="34" ry="26" fill="url(#bG2)" opacity="0.82" />
        <ellipse cx="82"  cy="448" rx="30" ry="24" fill="url(#bG3)" opacity="0.76" />
        <ellipse cx="186" cy="476" rx="38" ry="30" fill="url(#bG2)" opacity="0.88" />
        <ellipse cx="204" cy="458" rx="32" ry="26" fill="url(#bG1)" opacity="0.80" />
        <ellipse cx="170" cy="462" rx="28" ry="22" fill="url(#bG3)" opacity="0.74" />
      </g>

      {/* Atmospheric edge fade overlay */}
      <rect x="-20" y="-20" width="560" height="720" fill="url(#sceneFade)" />
    </svg>
  )
}

/* ─── tsParticles config ──────────────────────────────────
   15-25 gentle petals, multi-size, curved drift paths
─────────────────────────────────────────────────────────── */
const particlesConfig = {
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 40,
  particles: {
    number: { value: 20, density: { enable: true, width: 800, height: 800 } },
    color: {
      value: ['#fce8f4', '#f5c6e8', '#eca8d6', '#f8d8ee', '#ffffff'],
    },
    shape: {
      type: 'image',
      options: {
        image: {
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 52'%3E%3Cellipse cx='20' cy='28' rx='14' ry='22' fill='%23f5c6e8' opacity='0.88' transform='rotate(-12 20 28)'/%3E%3Cellipse cx='20' cy='26' rx='9' ry='16' fill='%23fce8f4' opacity='0.70' transform='rotate(-12 20 28)'/%3E%3C/svg%3E",
          width: 40,
          height: 52,
        },
      },
    },
    opacity: {
      value: { min: 0.35, max: 0.80 },
      animation: { enable: true, speed: 0.3, sync: false },
    },
    size: {
      value: { min: 5, max: 14 },
      animation: { enable: false },
    },
    move: {
      enable: true,
      speed: { min: 0.6, max: 1.6 },
      direction: 'bottom',
      random: true,
      straight: false,
      outModes: { default: 'out' },
      gravity: { enable: true, acceleration: 0.05 },
      drift: { value: { min: -1.5, max: 1.5 } },
      warp: false,
    },
    rotate: {
      value: { min: 0, max: 360 },
      direction: 'random',
      animation: { enable: true, speed: { min: 2, max: 6 }, sync: false },
    },
    wobble: {
      enable: true,
      distance: 12,
      speed: { angle: 3, move: 2 },
    },
    life: {
      duration: { sync: false, value: { min: 12, max: 24 } },
      count: 0,
    },
    zIndex: { value: { min: 0, max: 5 }, opacityRate: 1 },
  },
  emitters: [
    {
      direction: 'bottom',
      rate: { delay: 1.2, quantity: 1 },
      size: { width: 100, height: 0 },
      position: { x: 50, y: -5 },
      life: {},
    },
    {
      direction: 'bottom-right',
      rate: { delay: 2.5, quantity: 1 },
      size: { width: 30, height: 0 },
      position: { x: 10, y: -5 },
      life: {},
    },
  ],
  interactivity: { events: {} },
  detectRetina: true,
}

/* ─── Main Component ──────────────────────────────────────*/
export default function CherryBlossomBackground() {
  const particlesInit = useCallback(async (engine) => {
    await loadSlim(engine)
  }, [])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 1. Base atmospheric gradient — pink-burgundy wash */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 70% 55% at 75% 95%, rgba(236,168,214,0.22) 0%, transparent 55%),
          radial-gradient(ellipse 50% 45% at 15% 85%, rgba(180,50,90,0.18) 0%, transparent 50%),
          radial-gradient(ellipse 80% 60% at 85% 10%, rgba(236,168,214,0.10) 0%, transparent 55%),
          linear-gradient(160deg, #1c0a14 0%, #16080f 45%, #1a0b10 80%, #1e0e14 100%)
        `,
      }} />

      {/* 2. Tree scene — full-bleed bottom-right atmospheric layer */}
      <motion.div
        style={{
          position: 'absolute',
          bottom: '-2%',
          right: '-8%',
          width: '72vw',
          maxWidth: '520px',
          height: 'auto',
          transformOrigin: 'center bottom',
        }}
        animate={{
          rotate: [-0.8, 0.5, -0.5, 0.8, -0.8],
          x: [-1, 1.5, -0.5, 1, -1],
        }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.25, 0.5, 0.75, 1],
        }}
      >
        {/* Soft pink underglow — tree base atmosphere */}
        <div style={{
          position: 'absolute',
          bottom: '0%',
          left: '10%',
          right: '10%',
          height: '35%',
          background: 'radial-gradient(ellipse 80% 80% at 50% 100%, rgba(236,168,214,0.18) 0%, transparent 70%)',
          filter: 'blur(18px)',
          zIndex: 1,
        }} />
        <div style={{ position: 'relative', zIndex: 2, opacity: 0.78 }}>
          <TreeScene />
        </div>
      </motion.div>

      {/* 3. Left-edge misty bloom hint — a few blossoms peeking from left */}
      <motion.div
        style={{
          position: 'absolute',
          bottom: '20%',
          left: '-12%',
          width: '28vw',
          maxWidth: '180px',
          opacity: 0.30,
          transformOrigin: 'bottom right',
        }}
        animate={{ rotate: [1, -0.8, 0.6, -1, 1] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg viewBox="0 0 220 340" fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', overflow: 'visible' }}>
          <defs>
            <radialGradient id="lbG1" cx="50%" cy="40%" r="55%">
              <stop offset="0%"   stopColor="#fce8f4" stopOpacity="0.85" />
              <stop offset="60%"  stopColor="#eca8d6" stopOpacity="0.50" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Thin branch */}
          <path d="M180 340 C165 300 148 262 128 228 C110 198 90 176 68 162 C50 150 32 146 16 152"
            stroke="#3d2414" strokeWidth="9" strokeLinecap="round" opacity="0.80" />
          <path d="M70 164 C52 150 36 138 18 130"
            stroke="#3d2414" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
          <path d="M130 230 C114 214 96 200 78 190"
            stroke="#3d2414" strokeWidth="4" strokeLinecap="round" opacity="0.60" />
          {/* Blossoms */}
          <ellipse cx="18" cy="148" rx="26" ry="20" fill="url(#lbG1)" opacity="0.90" />
          <ellipse cx="36" cy="132" rx="22" ry="18" fill="url(#lbG1)" opacity="0.80" />
          <ellipse cx="8"  cy="132" rx="18" ry="14" fill="url(#lbG1)" opacity="0.72" />
          <ellipse cx="78" cy="188" rx="24" ry="18" fill="url(#lbG1)" opacity="0.82" />
          <ellipse cx="96" cy="172" rx="20" ry="16" fill="url(#lbG1)" opacity="0.72" />
        </svg>
      </motion.div>

      {/* 4. tsParticles — floating petals layer */}
      <Particles
        id="cherry-petals"
        options={particlesConfig}
        init={particlesInit}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
        }}
      />

      {/* 5. Overall scene vignette — edges dark, center breathing */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 120% 120% at 50% 50%,
            transparent 30%,
            rgba(12, 4, 8, 0.45) 85%,
            rgba(8, 2, 6, 0.75) 100%
          )
        `,
        zIndex: 4,
      }} />
    </div>
  )
}
