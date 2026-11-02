import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, useToast, useEmergency } from '../App'

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export default function SafeWalk() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { triggerEmergency } = useEmergency()

  const [activeWalk, setActiveWalk] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState(null)

  const [destName, setDestName]     = useState('')
  const [etaMinutes, setEtaMinutes] = useState(15)

  useEffect(() => { checkActiveWalk() }, [])

  // Countdown timer for active walk
  useEffect(() => {
    if (!activeWalk || !activeWalk.eta) return
    const timer = setInterval(() => {
      const eta = new Date(activeWalk.eta)
      const now = new Date()
      const diff = eta - now
      if (diff <= 0) {
        setTimeRemaining('OVERDUE')
        clearInterval(timer)
        triggerEmergency('safewalk')
      } else {
        const mins = Math.floor(diff / 60000)
        const secs = Math.floor((diff % 60000) / 1000)
        setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [activeWalk, triggerEmergency])

  const checkActiveWalk = async () => {
    try {
      const data = await apiFetch('/api/safewalk/active')
      if (data.safewalk) setActiveWalk(data.safewalk)
    } catch {
      console.log('No active walk')
    } finally {
      setLoading(false)
    }
  }

  const startWalk = async (e) => {
    e.preventDefault()
    try {
      let lat = 0, lng = 0
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      } catch { /* ok */ }

      const data = await apiFetch('/api/safewalk/start', {
        method: 'POST',
        body: JSON.stringify({ dest_name: destName, dest_lat: lat, dest_lng: lng, eta_minutes: etaMinutes }),
      })
      setActiveWalk(data.safewalk)
      showToast('SafeWalk started! Stay safe!', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const endWalk = async () => {
    if (!activeWalk) return
    try {
      await apiFetch(`/api/safewalk/${activeWalk.id}/end`, { method: 'POST' })
      showToast('Glad you reached safely!', 'success')
      setActiveWalk(null)
      setTimeRemaining(null)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  if (loading) {
    return (
      <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spin" style={{ fontSize: '2rem' }} aria-hidden="true">✦</div>
      </div>
    )
  }

  return (
    <>
      <div className="page-abstract-bg safewalk" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
    <div className="page-content page-enter">
      {/* Page Header */}
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Go back">
          <BackIcon />
        </button>
        <div style={{ flex: 1 }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Virtual Companion</span>
          <h2 style={{ lineHeight: 1.1 }}>SafeWalk</h2>
        </div>
      </div>

      {/* Active Walk */}
      {activeWalk ? (
        <div className="safewalk-active slide-up">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Walking to
          </p>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '24px' }}>{activeWalk.dest_name}</h3>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Time Remaining
          </p>
          <div
            className={`safewalk-timer${timeRemaining === 'OVERDUE' ? ' text-red' : ''}`}
            role="timer"
            aria-live="polite"
          >
            {timeRemaining || '--:--'}
          </div>

          {timeRemaining === 'OVERDUE' && (
            <div className="threat-indicator danger" style={{ marginBottom: '20px' }} role="alert">
              You haven&apos;t checked in. Are you okay?
            </div>
          )}

          <div className="safewalk-progress" aria-hidden="true">
            <div className="safewalk-progress-fill" style={{ width: '40%' }} />
          </div>

          <button id="safewalk-safe-btn" className="btn btn-safe btn-full btn-lg" onClick={endWalk} style={{ marginBottom: '10px' }}>
            I Reached Safely
          </button>
          <button id="safewalk-help-btn" className="btn btn-danger btn-full" onClick={() => triggerEmergency('safewalk')}>
            I Need Help
          </button>
        </div>
      ) : (
        /* Start Walk Form */
        <div className="slide-up">
          <div className="glass-card-static" style={{ marginBottom: '24px', textAlign: 'center', padding: '28px 20px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', marginBottom: '10px', lineHeight: 1 }} aria-hidden="true">
              ✦
            </div>
            <h3 style={{ marginBottom: '8px' }}>Virtual Walking Companion</h3>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.84rem', lineHeight: 1.65 }}>
              Set your destination and expected arrival time. If you don&apos;t check in by then,
              your emergency contacts will be alerted.
            </p>
          </div>

          <form onSubmit={startWalk}>
            <div className="form-group">
              <label className="form-label" htmlFor="sw-dest">Where are you going?</label>
              <input
                id="sw-dest"
                type="text"
                className="form-input"
                placeholder="e.g. Home, Office, Friend's house"
                value={destName}
                onChange={e => setDestName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="sw-eta">Expected time to reach (minutes)</label>
              <input
                id="sw-eta"
                type="number"
                className="form-input"
                placeholder="15"
                value={etaMinutes}
                onChange={e => setEtaMinutes(parseInt(e.target.value) || 15)}
                min={1}
                max={180}
                required
              />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '5px', letterSpacing: '0.03em' }}>
                Check-in by {new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <button id="safewalk-start-btn" type="submit" className="btn btn-primary btn-full btn-lg">
              Start SafeWalk
            </button>
          </form>

          {/* How it works */}
          <div className="glass-card-static" style={{ marginTop: '24px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '10px' }}>How SafeWalk works</span>
            <ol style={{ paddingLeft: '18px', color: 'var(--muted-foreground)', fontSize: '0.82rem', lineHeight: '1.9', fontFamily: 'var(--font-sans)' }}>
              <li>Enter your destination and how long it should take</li>
              <li>A timer starts counting down</li>
              <li>When you arrive, tap &ldquo;I Reached Safely&rdquo;</li>
              <li>If the timer runs out without check-in, your contacts are alerted</li>
            </ol>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
