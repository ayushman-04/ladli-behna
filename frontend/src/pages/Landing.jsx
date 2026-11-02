import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, useAuth, useToast } from '../App'

/* ── Particle field background ─────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef(null)
  const mouse = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      canvas.width  = window.innerWidth  * dpr
      canvas.height = window.innerHeight * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const onMouseMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', (e) => {
      if (e.touches[0]) mouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }, { passive: true })

    // Create particles
    const COLORS = [
      'rgba(236,168,214,', // accent pink
      'rgba(255,220,240,', // soft white-pink
      'rgba(200,130,200,', // muted violet
      'rgba(255,255,255,', // white
    ]
    const count = 55
    const particles = Array.from({ length: count }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r:  Math.random() * 2.2 + 0.6,
      a:  Math.random() * 0.5 + 0.12,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      drift: Math.random() * Math.PI * 2,
      driftSpeed: (Math.random() - 0.5) * 0.008,
    }))

    let raf
    const draw = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      ctx.clearRect(0, 0, W, H)

      for (const p of particles) {
        p.drift += p.driftSpeed
        p.x += p.vx + Math.sin(p.drift) * 0.18
        p.y += p.vy + Math.cos(p.drift) * 0.12

        // Wrap around
        if (p.x < -20) p.x = W + 20
        if (p.x > W + 20) p.x = -20
        if (p.y < -20) p.y = H + 20
        if (p.y > H + 20) p.y = -20

        // Mouse repulsion
        const dx = p.x - mouse.current.x
        const dy = p.y - mouse.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const RADIUS = 100
        if (dist < RADIUS) {
          const force = (1 - dist / RADIUS) * 0.8
          p.x += (dx / dist) * force
          p.y += (dy / dist) * force
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.color + p.a + ')'
        ctx.fill()
      }

      // Draw faint connection lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 80) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(236,168,214,${0.06 * (1 - d / 80)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

// Animated cycling words
const WORDS = ['protecting', 'watching', 'alerting', 'guarding']

function AnimatedWord({ word }) {
  const [letters, setLetters] = useState([])

  useEffect(() => {
    const chars = word.split('')
    setLetters(chars.map(ch => ({ ch, state: 'entering' })))
    const timers = chars.map((ch, i) =>
      setTimeout(() => {
        setLetters(prev =>
          prev.map((l, j) => j === i ? { ...l, state: 'visible' } : l)
        )
      }, i * 48)
    )
    return () => timers.forEach(clearTimeout)
  }, [word])

  return (
    <span className="word-animated" aria-label={word}>
      {letters.map((l, i) => (
        <span key={`${word}-${i}`} className={l.state}>
          {l.ch}
        </span>
      ))}
    </span>
  )
}

export default function Landing() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  // Form fields
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone]     = useState('')

  // Animated word cycling
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex(i => (i + 1) % WORDS.length)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const data = await apiFetch('/api/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password, phone: phone || null }),
        })
        login(data.token, data.user)
        showToast('Welcome to ShieldHer!', 'success')
      } else {
        const data = await apiFetch('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        login(data.token, data.user)
        showToast('Welcome back!', 'success')
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="landing-page">
      {/* Canvas particle field */}
      <ParticleCanvas />

      {/* Animated floating orbs */}
      <div className="landing-orb landing-orb-1" aria-hidden="true" />
      <div className="landing-orb landing-orb-2" aria-hidden="true" />
      <div className="landing-orb landing-orb-3" aria-hidden="true" />
      {/* Center radial spotlight */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse 55% 40% at 50% 60%, rgba(236,168,214,0.09) 0%, transparent 65%)',
        pointerEvents: 'none', zIndex: 0,
        animation: 'safewalkPulse 7s ease-in-out infinite',
      }} />

      <div className="landing-inner">
        {/* Eyebrow */}
        <span className="landing-eyebrow">
          AI-powered women&apos;s safety
        </span>

        {/* Editorial headline */}
        <h1 className="landing-headline">
          Your safety,
        </h1>
        <p className="landing-headline-muted" aria-live="polite">
          always&nbsp;
          <AnimatedWord key={wordIndex} word={WORDS[wordIndex]} />
          .
        </p>

        <p className="landing-subtitle">
          Real-time AI threat detection, instant SOS alerts, and live location sharing — always in your pocket.
        </p>

        {/* Feature tags */}
        <div className="landing-features" aria-label="Key features">
          <span className="landing-feature-tag">AI Detection</span>
          <span className="landing-feature-tag">Motion Sensing</span>
          <span className="landing-feature-tag">Live Tracking</span>
          <span className="landing-feature-tag">Instant SOS</span>
        </div>

        {/* Auth card — glassmorphism */}
        <div className="auth-card">
          {/* Toggle */}
          <div className="auth-toggle" role="group" aria-label="Auth mode">
            <button
              id="auth-login-btn"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => { setMode('login'); setError('') }}
            >
              Login
            </button>
            <button
              id="auth-register-btn"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => { setMode('register'); setError('') }}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-name">Full Name</label>
                <input
                  id="reg-name"
                  type="text"
                  className="form-input"
                  placeholder="Enter your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label" htmlFor="reg-phone">Phone <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <input
                  id="reg-phone"
                  type="tel"
                  className="form-input"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
            )}

            {error && (
              <p className="form-error" role="alert" style={{ marginBottom: '14px' }}>
                {error}
              </p>
            )}

            <button
              id="auth-submit-btn"
              type="submit"
              className="btn btn-primary btn-full btn-lg btn-glow-pulse"
              disabled={loading}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
